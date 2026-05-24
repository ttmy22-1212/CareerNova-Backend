import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  AnalyzeCvDto,
  CheckHistoryResponseDto,
  CvJobMatchResultDto,
} from './dto/matching.dto';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';

const execAsync = promisify(exec);

// 1. ĐỊNH NGHĨA CÁC INTERFACE KHỚP TUYỆT ĐỐI VỚI ĐẶC TẢ THUẬT TOÁN
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

interface MatchingScriptOutput {
  job_title: string;
  match_score: number;
  matched_skills: MatchedSkillDetail[];
  partially_matched_skills: PartialSkillDetail[];
  missing_skills: MissingSkillDetail[];
}

@Injectable()
export class MatchingService {
  private readonly logger = new Logger(MatchingService.name);

  constructor(private readonly prisma: PrismaService) {}

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
    dto: AnalyzeCvDto,
    userId: string,
  ): Promise<CvJobMatchResultDto> {
    try {
      this.logger.log(
        `Starting CV analysis for cv_id: ${dto.cv_id} (User: ${userId}) against: ${dto.search_group}`,
      );

      // 1. Kiểm tra sự tồn tại của CV trong DB trước
      const cv = await this.prisma.userCv.findUnique({
        where: { cv_id: dto.cv_id },
        select: { file_url: true },
      });

      if (!cv) {
        throw new NotFoundException('CV not found in system');
      }

      let scriptOutput: MatchingScriptOutput;

      // 2. Kiểm tra biến Môi trường xem đang chạy REAL hay MOCK
      const matchingMode = process.env.MATCHING_MODE || 'mock';

      if (matchingMode === 'mock') {
        this.logger.log(
          '--- MATCHING MODE: MOCK DATA USING EXISTING DB SKILLS KICKED IN ---',
        );

        const groupSkillsWeights =
          await this.prisma.jobGroupSkillWeight.findMany({
            where: {
              search_group: dto.search_group, // Tìm theo nhóm công việc truyền lên
            },
            include: {
              skill: true, // Join sang bảng Skill để lấy skill_name
            },
            take: 6, // Lấy tối đa 6 kĩ năng liên quan để chia đều cho 3 nhóm trên UI
          });

        // Tạo một mảng chứa thông tin kĩ năng chuẩn
        const dbSkills: {
          skill_id: number;
          skill_name: string;
          weight: number;
        }[] = [];

        if (groupSkillsWeights.length > 0) {
          // Nếu tìm thấy cấu hình kĩ năng liên kết với search_group trong DB
          for (const item of groupSkillsWeights) {
            dbSkills.push({
              skill_id: item.skill_id,
              skill_name: item.skill.skill_name,
              weight: Number(item.weight_wi), // Chuyển Decimal từ bảng weight sang number
            });
          }
        }

        if (dbSkills.length === 0) {
          this.logger.warn(
            `Không tìm thấy cấu hình kĩ năng cho nhóm "${dto.search_group}" trong DB. Tiến hành tạo kĩ năng giả lập.`,
          );
          const defaultNames = [
            'JavaScript',
            'Docker',
            'SQL',
            'Python',
            'Linux',
            'AWS',
          ];
          const defaultWeights = [0.25, 0.15, 0.2, 0.2, 0.1, 0.1];

          for (let i = 0; i < defaultNames.length; i++) {
            const mockSkillName = `test_${defaultNames[i]}`;

            let skill = await this.prisma.skill.findUnique({
              where: { skill_name: mockSkillName },
            });
            if (!skill) {
              skill = await this.prisma.skill.create({
                data: { skill_name: mockSkillName },
              });
            }
            dbSkills.push({
              skill_id: skill.skill_id,
              skill_name: skill.skill_name,
              weight: defaultWeights[i],
            });
          }
        }

        // CHUẨN HÓA DỮ LIỆU MOCK KHỚP 100% VỚI KHAI BÁO CỦA INTERFACE
        const matchedSkills: MatchedSkillDetail[] = [
          {
            skill_id: dbSkills[0].skill_id,
            skill_name: dbSkills[0].skill_name,
            weight: 0.25,
            similarity: 0.92,
            contribution: 0.23,
          },
          {
            skill_id: dbSkills[1].skill_id,
            skill_name: dbSkills[1].skill_name,
            weight: 0.15,
            similarity: 0.88,
            contribution: 0.132,
          },
        ];

        const partialSkills: PartialSkillDetail[] = [
          {
            skill_id: dbSkills[2].skill_id,
            skill_name: dbSkills[2].skill_name,
            weight: 0.2,
            similarity: 0.65,
            contribution: 0.13,
            gap: 0.07,
            matched_via: 'Related Skill A',
          },
          {
            skill_id: dbSkills[3].skill_id,
            skill_name: dbSkills[3].skill_name,
            weight: 0.2,
            similarity: 0.58,
            contribution: 0.116,
            gap: 0.084,
            matched_via: 'Related Skill B',
          },
        ];

        const missingSkills: MissingSkillDetail[] = [
          {
            skill_id: dbSkills[4].skill_id,
            skill_name: dbSkills[4].skill_name,
            weight: 0.1,
            similarity: 0.12,
            gap: 0.088,
          },
          {
            skill_id: dbSkills[5].skill_id,
            skill_name: dbSkills[5].skill_name,
            weight: 0.1,
            similarity: 0.05,
            gap: 0.095,
          },
        ];

        scriptOutput = {
          job_title: dto.search_group,
          match_score: 0.57,
          matched_skills: matchedSkills,
          partially_matched_skills: partialSkills,
          missing_skills: missingSkills,
        };

        const skillsToInsert = [...matchedSkills, ...partialSkills];

        this.logger.log(
          `Mocking insertion of ${skillsToInsert.length} skills into user_cv_skills for cv_id: ${dto.cv_id}`,
        );
        for (const s of skillsToInsert) {
          await this.prisma.userCvSkill.upsert({
            where: {
              cv_id_skill_id: {
                cv_id: dto.cv_id,
                skill_id: s.skill_id,
              },
            },
            update: {}, // Nếu đã tồn tại mối quan hệ song phương thì giữ nguyên, không ghi đè dữ liệu cũ
            create: {
              cv_id: dto.cv_id,
              skill_id: s.skill_id,
            },
          });
        }
      } else {
        this.logger.log(
          '--- MATCHING MODE: MOCK DATA WITH DB SKILLS & USER_CV_SKILLS SYNC ---',
        );
        if (!cv.file_url) {
          throw new BadRequestException(
            'CV record exists but file_url is empty',
          );
        }

        const relativePythonPath =
          process.env.MATCHING_SRC_PATH || './.venv/Scripts/python.exe';
        const absolutePythonPath = path.resolve(
          process.cwd(),
          relativePythonPath,
        );

        const command = `"${absolutePythonPath}" -m matching_cv.match_cv --cv ${cv.file_url} --search-group "${dto.search_group}" --source-id ${userId}`;

        this.logger.log(`Executing system CLI command: ${command}`);
        const { stdout, stderr } = await execAsync(command);

        if (stderr && !stdout) {
          this.logger.error(`Script error stream: ${stderr}`);
          throw new Error(
            'Python matching script executed with critical error',
          );
        }

        scriptOutput = JSON.parse(stdout.trim()) as MatchingScriptOutput;
      }

      // 3. Ghi dữ liệu vào database một cách an toàn (Sử dụng InputJsonValue thay vì băm bừa 'as any')
      const radarDataJson =
        scriptOutput.matched_skills as unknown as Prisma.InputJsonValue;

      const gapReportJson: GapReportStructure = {
        partially_matched_skills: scriptOutput.partially_matched_skills,
        missing_skills: scriptOutput.missing_skills,
      };

      const savedMatch = await this.prisma.cvJobMatch.create({
        data: {
          cv_id: dto.cv_id,
          match_type: 'job_group',
          search_group: scriptOutput.job_title || dto.search_group,
          match_score: scriptOutput.match_score,
          radar_data: radarDataJson,
          gap_report: gapReportJson as unknown as Prisma.InputJsonValue,
        },
      });

      this.logger.log(
        `CV analysis handled successfully with match_id: ${savedMatch.match_id}`,
      );
      return savedMatch as CvJobMatchResultDto;
    } catch (error: unknown) {
      this.handleError(error, 'Analyze CV');
      throw new BadRequestException('Failed to process and match CV data');
    }
  }

  async getMatchDetail(matchId: string): Promise<CvJobMatchResultDto> {
    try {
      this.logger.log(`Fetching match details for ID: ${matchId}`);
      const matchDetail = await this.prisma.cvJobMatch.findUnique({
        where: { match_id: matchId },
      });

      if (!matchDetail) {
        throw new NotFoundException('Match analysis record not found');
      }

      return matchDetail as CvJobMatchResultDto;
    } catch (error: unknown) {
      this.handleError(error, 'Get Match Detail');
      throw new BadRequestException('Could not retrieve match details');
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
