import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import axios from 'axios';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  AnalyzeCvDto,
  CheckHistoryResponseDto,
  CvJobMatchResultDto,
  MatchCategoryResponseDto,
  RadarCategoryResponseDto,
} from './dto/matching.dto';
import * as path from 'path';
import FormData from 'form-data';

type AnalyzeCvInput = AnalyzeCvDto & { force?: boolean };

interface MatchedSkillDetail {
  skill_id: number;
  skill_name: string;
  weight: number;
  similarity: number;
  contribution: number;
}

interface PartialSkillDetail extends MatchedSkillDetail {
  gap: number;
  matched_via: string;
}

interface MissingSkillDetail {
  skill_id: number;
  skill_name: string;
  weight: number;
  similarity: number;
  gap: number;
}

interface GapReportStructure {
  partially_matched_skills: PartialSkillDetail[];
  missing_skills: MissingSkillDetail[];
}

export interface StudentSkillDetail {
  original_skill: string;
  skill_id: number;
  skill_name: string;
  similarity_score: number;
}

export interface MatchingScriptOutput {
  job_title?: string;
  search_group?: string;
  match_score: number;
  match_percent?: number;
  cv_id?: number | string;
  job_id?: number;
  student_skills?: StudentSkillDetail[];
  matched_skills: MatchedSkillDetail[];
  partially_matched_skills: PartialSkillDetail[];
  missing_skills: MissingSkillDetail[];
}

@Injectable()
export class MatchingService {
  private readonly logger = new Logger(MatchingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  async getJobGroups(): Promise<string[]> {
    try {
      this.logger.log(
        'Fetching distinct job groups from weights configuration',
      );
      const groups = await this.prisma.jobGroupSkillWeight.groupBy({
        by: ['search_group'],
      });
      return groups.map((g) => g.search_group);
    } catch (error: unknown) {
      this.handleError(error, 'Get Job Groups');
      return [];
    }
  }

  async checkHistory(userId: string): Promise<CheckHistoryResponseDto> {
    try {
      this.logger.log(`Checking matching history for user: ${userId}`);

      const latestMatch = await this.prisma.cvJobMatch.findFirst({
        where: {
          cv: {
            user_id: userId,
          },
        },
        orderBy: {
          created_at: 'desc',
        },
        select: {
          match_id: true,
        },
      });

      return {
        has_history: !!latestMatch,
        latest_match_id: latestMatch ? latestMatch.match_id : null,
      };
    } catch (error: unknown) {
      this.handleError(error, 'Check History');
      throw new BadRequestException('Could not verify matching history');
    }
  }

  async analyzeCv(
    dto: AnalyzeCvInput,
    userId: string,
  ): Promise<CvJobMatchResultDto> {
    try {
      if (!dto.search_group && !dto.job_url) {
        throw new BadRequestException(
          'You must provide either search_group or job_url to analyze',
        );
      }

      this.logger.log(
        `Starting CV analysis for cv_id: ${dto.cv_id} (User: ${userId}) against: ${dto.job_url ? 'URL: ' + dto.job_url : 'Group: ' + dto.search_group}`,
      );

      const cv = await this.prisma.userCv.findUnique({
        where: { cv_id: dto.cv_id },
        select: { file_url: true },
      });

      if (!cv) {
        throw new NotFoundException('CV not found in system');
      }
      const matchTypeCheck = dto.job_url ? 'cv_job' : 'job_group';
      const searchGroupValueCheck = dto.job_url ? null : dto.search_group;

      this.logger.log(
        `Checking for existing matching result for cv_id: ${dto.cv_id} and type: ${matchTypeCheck}`,
      );

      const existingMatch = await this.prisma.cvJobMatch.findFirst({
        where: {
          cv_id: dto.cv_id,
          match_type: matchTypeCheck,
          ...(matchTypeCheck === 'job_group'
            ? { search_group: searchGroupValueCheck }
            : {}),
        },
        orderBy: {
          created_at: 'desc',
        },
      });

      if (existingMatch && !dto.force) {
        if (
          matchTypeCheck === 'job_group' ||
          (matchTypeCheck === 'cv_job' && existingMatch.job_id)
        ) {
          this.logger.log(
            `Found existing matching. Returning match_id: ${existingMatch.match_id}`,
          );

          return {
            ...existingMatch,
            job_id: existingMatch.job_id
              ? existingMatch.job_id.toString()
              : null,
            match_score: existingMatch.match_score
              ? Number(existingMatch.match_score)
              : null,
          } as unknown as CvJobMatchResultDto;
        }
      }
      let scriptOutput: MatchingScriptOutput;
      if (!cv.file_url) {
        throw new BadRequestException('CV record exists but file_url is empty');
      }

      try {
        const rawUrl =
          this.configService.get<string>('ALGO_SERVICE_URL') ??
          'http://146.190.109.180:8000';
        const algoBaseUrl = rawUrl.replace(/[\r\n]/g, '').trim();

        console.log('ALGO_BASE_URL:', algoBaseUrl);
        console.log('CV File URL:', cv.file_url);
        const fileResponse = await axios.get(cv.file_url, {
          responseType: 'arraybuffer',
        });

        const fileBuffer = Buffer.from(fileResponse.data as ArrayBuffer);

        const formData = new FormData();

        const rawContentType = fileResponse.headers['content-type'];

        let contentTypeString = 'application/pdf';

        if (typeof rawContentType === 'string') {
          contentTypeString = rawContentType;
        } else if (Array.isArray(rawContentType) && rawContentType.length > 0) {
          contentTypeString = rawContentType[0];
        }

        formData.append('file', fileBuffer, {
          filename: path.basename(cv.file_url),
          contentType: contentTypeString,
        });
        let targetUrl = '';
        if (dto.job_url) {
          // Match theo URL tuyển dụng cụ thể
          targetUrl = `${algoBaseUrl}/api/v1/matching/job-url`;
          formData.append('url', dto.job_url);
          formData.append('source_id', String(userId));
        } else {
          // Match theo Search Group tổng quan (Từ dữ liệu DB)
          targetUrl = `${algoBaseUrl}/api/v1/matching/search-group`;
          formData.append('search_group', dto.search_group!);
          formData.append('source_id', String(userId));
        }

        this.logger.log(`Sending multipart request to FastAPI: ${targetUrl}`);
        const algoResponse = await axios.post(targetUrl, formData);

        const fastapiData = algoResponse.data as {
          message: string;
          output: string;
        };

        if (fastapiData && fastapiData.output) {
          try {
            const jsonStartIndex = fastapiData.output.indexOf('{');
            if (jsonStartIndex === -1) {
              throw new Error(
                'Could not find JSON payload inside python output string',
              );
            }

            const cleanJsonString = fastapiData.output
              .substring(jsonStartIndex)
              .trim();

            scriptOutput = JSON.parse(cleanJsonString) as MatchingScriptOutput;

            this.logger.log(
              `Parse successfully! Match Score: ${scriptOutput.match_score}`,
            );
          } catch (parseError) {
            this.logger.error(
              `Failed to parse Python raw output string: ${(parseError as Error).message}`,
            );
            throw new Error(
              'Received invalid response format from Python matching service, unable to parse JSON output',
            );
          }
        } else {
          throw new Error(
            'FastAPI returned empty or invalid response structure',
          );
        }
      } catch (error) {
        this.logger.error(
          `Failed to execute matching via FastAPI: ${error as Error}.message}`,
        );
        throw new Error(
          'Python matching service responded with an error or network issue occurred',
        );
      }

      const radarDataJson =
        scriptOutput.matched_skills as unknown as Prisma.InputJsonValue;

      const gapReportJson: GapReportStructure = {
        partially_matched_skills: scriptOutput.partially_matched_skills,
        missing_skills: scriptOutput.missing_skills,
      };
      const matchType =
        dto.job_url || scriptOutput.job_id ? 'cv_job' : 'job_group';
      const searchGroupValue =
        scriptOutput.search_group || dto.search_group || null;

      const savedMatch = await this.prisma.cvJobMatch.create({
        data: {
          cv_id: dto.cv_id,
          match_type: matchType,
          search_group: searchGroupValue,
          job_id: scriptOutput.job_id ? BigInt(scriptOutput.job_id) : null,
          match_score: scriptOutput.match_score,
          radar_data: radarDataJson,
          gap_report: gapReportJson as unknown as Prisma.InputJsonValue,
        },
      });

      this.logger.log(
        `CV analysis handled successfully with match_id: ${savedMatch.match_id}`,
      );

      return {
        ...savedMatch,
        job_id: savedMatch.job_id ? savedMatch.job_id.toString() : null,
        match_score: savedMatch.match_score
          ? Number(savedMatch.match_score)
          : null,
      } as unknown as CvJobMatchResultDto;
    } catch (error: unknown) {
      this.handleError(error, 'Analyze CV');
      throw new BadRequestException('Failed to process and match CV data');
    }
  }

  async getMatchDetail(
    userId: string,
    matchId: string,
  ): Promise<CvJobMatchResultDto> {
    try {
      this.logger.log(`Fetching match details for ID: ${matchId}`);
      const matchDetail = await this.prisma.cvJobMatch.findFirst({
        where: {
          match_id: matchId,
          cv: {
            user_id: userId,
          },
        },
      });

      if (!matchDetail) {
        throw new NotFoundException(
          'Match analysis record not found or unauthorized',
        );
      }

      const safeData = JSON.parse(
        JSON.stringify(matchDetail, (_key, value: unknown) =>
          typeof value === 'bigint' ? value.toString() : value,
        ),
      ) as unknown as CvJobMatchResultDto;

      return safeData;
    } catch (error: unknown) {
      this.handleError(error, 'Get Match Detail');
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new BadRequestException('Could not retrieve match details');
    }
  }

  async getAllMatches(
    userId: string,
    cvId?: string,
  ): Promise<Omit<CvJobMatchResultDto, 'radar_data' | 'gap_report'>[]> {
    try {
      this.logger.log(
        `Fetching match history for user ID: ${userId}${cvId ? ` and CV ID: ${cvId}` : ''}`,
      );

      const where: Prisma.CvJobMatchWhereInput = {
        ...(cvId ? { cv_id: cvId } : {}),
        cv: {
          user_id: userId,
        },
      };

      const matches = await this.prisma.cvJobMatch.findMany({
        where,
        select: {
          match_id: true,
          cv_id: true,
          match_type: true,
          search_group: true,
          match_score: true,
          created_at: true,
          updated_at: true,
        },
        orderBy: { created_at: 'desc' },
      });

      return matches.map((match) => ({
        ...match,
        match_score: match.match_score ? Number(match.match_score) : null,
      })) as Omit<CvJobMatchResultDto, 'radar_data' | 'gap_report'>[];
    } catch (error: unknown) {
      this.logger.error(
        `Failed to get all matches: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw new BadRequestException('Could not retrieve match history');
    }
  }

  async getMatchCategories(
    userId: string,
    matchId: string,
  ): Promise<MatchCategoryResponseDto[]> {
    try {
      const match = await this.prisma.cvJobMatch.findFirst({
        where: {
          match_id: matchId,
          cv: {
            user_id: userId,
          },
        },
        select: {
          radar_data: true,
          gap_report: true,
        },
      });

      if (!match) {
        throw new NotFoundException(
          `Match history with ID ${matchId} not found`,
        );
      }

      const radarSkills =
        (match.radar_data as unknown as MatchedSkillDetail[]) || [];

      const gapReport =
        (match.gap_report as unknown as {
          missing_skills?: Array<{ skill_name: string }>;
          partially_matched_skills?: Array<{ skill_name: string }>;
        }) || {};

      const missingSkills = gapReport.missing_skills || [];
      const partialSkills = gapReport.partially_matched_skills || [];

      const matchedSkillNames = Array.from(
        new Set([
          ...radarSkills.map((s) => s.skill_name),
          ...missingSkills.map((s) => s.skill_name),
          ...partialSkills.map((s) => s.skill_name),
        ]),
      );

      const [allSkillsInDb, matchedSkillsInDb] = await Promise.all([
        this.prisma.skill.findMany({
          where: {
            category: { not: null },
          },
          select: {
            category: true,
          },
        }),

        this.prisma.skill.findMany({
          where: {
            skill_name: {
              in: matchedSkillNames,
            },
            category: {
              not: null,
            },
          },
          select: {
            category: true,
          },
        }),
      ]);

      const allCategories = Array.from(
        new Set(
          allSkillsInDb
            .map((s) => s.category?.trim())
            .filter(Boolean) as string[],
        ),
      );

      const matchedCategoriesSet = new Set(
        matchedSkillsInDb
          .map((s) => s.category?.trim())
          .filter(Boolean) as string[],
      );

      const formattedCategories = allCategories
        .map((category) => ({
          category,
          is_matched: matchedCategoriesSet.has(category),
        }))
        .sort((a, b) => Number(b.is_matched) - Number(a.is_matched));

      return [
        {
          category: 'All',
          is_matched: true,
        },
        ...formattedCategories,
      ];
    } catch (error) {
      this.handleError(error, 'MatchingService.getMatchCategories');
      throw error;
    }
  }

  async getRadarByCategory(
    userId: string,
    matchId: string,
    categoryName: string,
  ): Promise<RadarCategoryResponseDto> {
    try {
      const match = await this.prisma.cvJobMatch.findFirst({
        where: {
          match_id: matchId,
          cv: {
            user_id: userId,
          },
        },
        select: {
          radar_data: true,
          gap_report: true,
        },
      });

      if (!match) {
        throw new NotFoundException(
          `Match history with ID ${matchId} not found`,
        );
      }

      const radarData =
        (match.radar_data as unknown as MatchedSkillDetail[]) || [];

      const gapReport = (match.gap_report as unknown as GapReportStructure) || {
        missing_skills: [],
        partially_matched_skills: [],
      };

      if (categoryName.trim().toLowerCase() === 'all') {
        return {
          radar_data: radarData,
          gap_report: {
            missing_skills: gapReport.missing_skills || [],
            partially_matched_skills: gapReport.partially_matched_skills || [],
          },
        };
      }

      const targetSkillsInDb = await this.prisma.skill.findMany({
        where: {
          category: {
            equals: categoryName,
            mode: 'insensitive',
          },
        },
        select: {
          skill_name: true,
        },
      });

      const allowedSkillNames = new Set(
        targetSkillsInDb.map((s) => s.skill_name),
      );

      return {
        radar_data: radarData.filter((skill) =>
          allowedSkillNames.has(skill.skill_name),
        ),

        gap_report: {
          missing_skills: (gapReport.missing_skills || []).filter((skill) =>
            allowedSkillNames.has(skill.skill_name),
          ),

          partially_matched_skills: (
            gapReport.partially_matched_skills || []
          ).filter((skill) => allowedSkillNames.has(skill.skill_name)),
        },
      };
    } catch (error) {
      this.handleError(error, 'MatchingService.getRadarByCategory');
      throw error;
    }
  }

  private handleError(error: unknown, context: string) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    const stack = error instanceof Error ? error.stack : '';
    this.logger.error(
      `Matching service [${context}] failed: ${message}`,
      stack,
    );
  }
}
