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

      let scriptOutput: MatchingScriptOutput;

      const matchingMode = process.env.MATCHING_MODE || 'mock';

      if (matchingMode === 'mock') {
        this.logger.log(
          '--- MATCHING MODE: MOCK DATA USING EXISTING DB SKILLS KICKED IN ---',
        );

        if (dto.job_url) {
          this.logger.log('👉 Mocking data specifically for JOB URL mode');

          const skillNames = [
            'Java',
            'Spring Boot',
            'Docker Compose',
            'Docker (Software)',
            'Teamwork',
            'Spring Data',
            'MySQL',
            'Microsoft SQL Servers',
            'Spring Security',
            'Hibernate (Java)',
            'WebSocket',
            'PostgreSQL',
            'Git (Version Control System)',
            'Github',
            'Professional Responsibility',
            'Problem Solving',
            'Logical Reasoning',
            'Independent Thinking',
            'Time Management',
            'Adaptability',
            'Learning Agility',
            'JavaScript (Programming Language)',
            'Object-Oriented Programming (OOP)',
            'Cascading Style Sheets (CSS)',
          ];
          const skillsMap: Record<string, number> = {};

          for (const name of skillNames) {
            let skill = await this.prisma.skill.findUnique({
              where: { skill_name: name },
            });
            if (!skill) {
              try {
                skill = await this.prisma.skill.create({
                  data: { skill_name: name },
                });
              } catch (e) {
                skill = await this.prisma.skill.findFirst({
                  where: { skill_name: name },
                });
                if (!skill) {
                  const lastSkill = await this.prisma.skill.findFirst({
                    orderBy: { skill_id: 'desc' },
                  });
                  const nextId = lastSkill ? lastSkill.skill_id + 1 : 1;
                  skill = await this.prisma.skill.create({
                    data: { skill_id: nextId, skill_name: name },
                  });
                }
              }
            }
            skillsMap[name] = skill.skill_id;
          }

          let mockJob = await this.prisma.job.findFirst({
            select: { job_id: true },
          });
          if (!mockJob) {
            let mockCompany = await this.prisma.company.findFirst({
              select: { company_id: true },
            });
            if (!mockCompany) {
              mockCompany = await this.prisma.company.create({
                data: { company_id: BigInt(1), name: 'Mock Company' },
              });
            }
            mockJob = await this.prisma.job.create({
              data: {
                company_id: mockCompany.company_id,
                title: 'Software Developer (ASP.NET, C#, English)',
                job_category: 'software developer',
              },
            });
          }

          scriptOutput = {
            job_title: 'Software Developer (ASP.NET, C#, English)',
            search_group: 'software developer',
            match_score: 0.647542,
            match_percent: 64.75,
            job_id: Number(mockJob.job_id),
            student_skills: [
              {
                original_skill: 'Java',
                skill_id: skillsMap['Java'],
                skill_name: 'Java',
                similarity_score: 1.0,
              },
              {
                original_skill: 'Spring Boot',
                skill_id: skillsMap['Spring Boot'],
                skill_name: 'Spring Boot',
                similarity_score: 1.0,
              },
              {
                original_skill: 'Docker Compose',
                skill_id: skillsMap['Docker Compose'],
                skill_name: 'Docker Compose',
                similarity_score: 1.0,
              },
              {
                original_skill: 'Docker',
                skill_id: skillsMap['Docker (Software)'],
                skill_name: 'Docker (Software)',
                similarity_score: 1.0,
              },
              {
                original_skill: 'Teamwork',
                skill_id: skillsMap['Teamwork'],
                skill_name: 'Teamwork',
                similarity_score: 1.0,
              },
              {
                original_skill: 'Spring Data JPA',
                skill_id: skillsMap['Spring Data'],
                skill_name: 'Spring Data',
                similarity_score: 0.6298,
              },
              {
                original_skill: 'MySQL',
                skill_id: skillsMap['MySQL'],
                skill_name: 'MySQL',
                similarity_score: 1.0,
              },
              {
                original_skill: 'SQL Server',
                skill_id: skillsMap['Microsoft SQL Servers'],
                skill_name: 'Microsoft SQL Servers',
                similarity_score: 1.0,
              },
              {
                original_skill: 'Spring Security',
                skill_id: skillsMap['Spring Security'],
                skill_name: 'Spring Security',
                similarity_score: 1.0,
              },
              {
                original_skill: 'Hibernate',
                skill_id: skillsMap['Hibernate (Java)'],
                skill_name: 'Hibernate (Java)',
                similarity_score: 1.0,
              },
              {
                original_skill: 'WebSocket',
                skill_id: skillsMap['WebSocket'],
                skill_name: 'WebSocket',
                similarity_score: 1.0,
              },
              {
                original_skill: 'PostgreSQL',
                skill_id: skillsMap['PostgreSQL'],
                skill_name: 'PostgreSQL',
                similarity_score: 1.0,
              },
              {
                original_skill: 'Git',
                skill_id: skillsMap['Git (Version Control System)'],
                skill_name: 'Git (Version Control System)',
                similarity_score: 1.0,
              },
              {
                original_skill: 'GitHub',
                skill_id: skillsMap['Github'],
                skill_name: 'Github',
                similarity_score: 1.0,
              },
              {
                original_skill: 'Responsibility',
                skill_id: skillsMap['Professional Responsibility'],
                skill_name: 'Professional Responsibility',
                similarity_score: 0.7684,
              },
              {
                original_skill: 'Problem Solving',
                skill_id: skillsMap['Problem Solving'],
                skill_name: 'Problem Solving',
                similarity_score: 1.0,
              },
              {
                original_skill: 'Logical Thinking',
                skill_id: skillsMap['Logical Reasoning'],
                skill_name: 'Logical Reasoning',
                similarity_score: 0.687,
              },
              {
                original_skill: 'Independent Work',
                skill_id: skillsMap['Independent Thinking'],
                skill_name: 'Independent Thinking',
                similarity_score: 1.0,
              },
              {
                original_skill: 'Time Management',
                skill_id: skillsMap['Time Management'],
                skill_name: 'Time Management',
                similarity_score: 1.0,
              },
              {
                original_skill: 'Adaptability',
                skill_id: skillsMap['Adaptability'],
                skill_name: 'Adaptability',
                similarity_score: 1.0,
              },
              {
                original_skill: 'Learning Agility',
                skill_id: skillsMap['Learning Agility'],
                skill_name: 'Learning Agility',
                similarity_score: 1.0,
              },
            ],
            matched_skills: [
              {
                skill_id: skillsMap['Microsoft SQL Servers'],
                skill_name: 'Microsoft SQL Servers',
                weight: 0.0334,
                similarity: 1.0,
                contribution: 0.0334,
              },
              {
                skill_id: skillsMap['MySQL'],
                skill_name: 'MySQL',
                weight: 0.0383,
                similarity: 1.0,
                contribution: 0.0383,
              },
              {
                skill_id: skillsMap['Problem Solving'],
                skill_name: 'Problem Solving',
                weight: 0.0024,
                similarity: 1.0,
                contribution: 0.0024,
              },
              {
                skill_id: skillsMap['Teamwork'],
                skill_name: 'Teamwork',
                weight: 0.0085,
                similarity: 1.0,
                contribution: 0.0085,
              },
            ],
            partially_matched_skills: [
              {
                skill_id: skillsMap['JavaScript (Programming Language)'],
                skill_name: 'JavaScript (Programming Language)',
                weight: 0.0258,
                similarity: 0.3933,
                contribution: 0.010147,
                gap: 0.015653,
                matched_via: 'Java',
              },
              {
                skill_id: skillsMap['Object-Oriented Programming (OOP)'],
                skill_name: 'Object-Oriented Programming (OOP)',
                weight: 0.0361,
                similarity: 0.4616,
                contribution: 0.016662,
                gap: 0.019438,
                matched_via: 'Java',
              },
            ],
            missing_skills: [
              {
                skill_id: skillsMap['Cascading Style Sheets (CSS)'],
                skill_name: 'Cascading Style Sheets (CSS)',
                weight: 0.0321,
                similarity: 0.1541,
                gap: 0.027153,
              },
            ],
          };

          if (
            scriptOutput.student_skills &&
            scriptOutput.student_skills.length > 0
          ) {
            this.logger.log(
              `[MOCK URL] Insertion of ${scriptOutput.student_skills.length} skills into user_cv_skills`,
            );
            for (const s of scriptOutput.student_skills) {
              await this.prisma.userCvSkill.upsert({
                where: {
                  cv_id_skill_id: { cv_id: dto.cv_id, skill_id: s.skill_id },
                },
                update: {},
                create: { cv_id: dto.cv_id, skill_id: s.skill_id },
              });
            }
          }
        } else {
          this.logger.log('👉 Mocking data specifically for SEARCH GROUP mode');

          const groupSkillsWeights =
            await this.prisma.jobGroupSkillWeight.findMany({
              where: {
                search_group: dto.search_group,
              },
              include: {
                skill: true,
              },
              take: 6,
            });

          const dbSkills: {
            skill_id: number;
            skill_name: string;
            weight: number;
          }[] = [];

          if (groupSkillsWeights.length > 0) {
            for (const item of groupSkillsWeights) {
              dbSkills.push({
                skill_id: item.skill_id,
                skill_name: item.skill.skill_name,
                weight: Number(item.weight_wi),
              });
            }
          }

          // 💡 ĐIỀU CHỈNH AN TOÀN: Nếu số lượng kỹ năng lấy lên từ DB nhỏ hơn 6 (ví dụ chỉ có 4 phần tử)
          // Tiến hành chạy bù đắp thêm các kĩ năng ảo để mảng luôn đạt tối thiểu 6 phần tử, chặn đứng lỗi undefined index
          if (dbSkills.length < 6) {
            this.logger.warn(
              `Số lượng cấu hình kỹ năng cho nhóm "${dto.search_group}" nhỏ hơn 6 (${dbSkills.length}/6). Tiến hành bù đắp dữ liệu giả lập.`,
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
              // Chỉ bổ sung nếu mảng dbSkills chưa đủ 6 phần tử
              if (dbSkills.length >= 6) break;

              const mockSkillName = `test_${defaultNames[i]}`;

              let skill = await this.prisma.skill.findUnique({
                where: { skill_name: mockSkillName },
              });
              if (!skill) {
                try {
                  skill = await this.prisma.skill.create({
                    data: { skill_name: mockSkillName },
                  });
                } catch (e) {
                  skill = await this.prisma.skill.findFirst({
                    where: { skill_name: mockSkillName },
                  });
                  if (!skill) {
                    const lastSkill = await this.prisma.skill.findFirst({
                      orderBy: { skill_id: 'desc' },
                    });
                    const nextId = lastSkill ? lastSkill.skill_id + 1 : 1;
                    skill = await this.prisma.skill.create({
                      data: { skill_id: nextId, skill_name: mockSkillName },
                    });
                  }
                }
              }

              // Kiểm tra xem ID này đã vô tình trùng với ID kĩ năng thật bốc từ DB lên trước đó chưa
              if (
                !dbSkills.some(
                  (existing) => existing.skill_id === skill.skill_id,
                )
              ) {
                dbSkills.push({
                  skill_id: skill.skill_id,
                  skill_name: skill.skill_name,
                  weight: defaultWeights[i],
                });
              }
            }
          }

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
              update: {},
              create: {
                cv_id: dto.cv_id,
                skill_id: s.skill_id,
              },
            });
          }
        }
      } else {
        this.logger.log(
          '--- MATCHING MODE: REAL PYTHON CLI SCRIPT EXECUTION KICKED IN ---',
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

        let command = '';
        if (dto.job_url) {
          command = `"${absolutePythonPath}" -m matching_cv.match_cv_with_url --cv "${cv.file_url}" --url "${dto.job_url}"`;
        } else {
          command = `"${absolutePythonPath}" -m matching_cv.match_cv --cv ${cv.file_url} --search-group "${dto.search_group}" --source-id ${userId}`;
        }

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

  async getMatchDetail(matchId: string): Promise<CvJobMatchResultDto> {
    try {
      this.logger.log(`Fetching match details for ID: ${matchId}`);
      const matchDetail = await this.prisma.cvJobMatch.findUnique({
        where: { match_id: matchId },
      });

      if (!matchDetail) {
        throw new NotFoundException('Match analysis record not found');
      }

      const safeData = JSON.parse(
        JSON.stringify(matchDetail, (_key, value: unknown) =>
          typeof value === 'bigint' ? value.toString() : value,
        ),
      ) as unknown as CvJobMatchResultDto;

      return safeData;
    } catch (error: unknown) {
      this.handleError(error, 'Get Match Detail');
      throw new BadRequestException('Could not retrieve match details');
    }
  }

  async getAllMatches(
    userId: string,
  ): Promise<Omit<CvJobMatchResultDto, 'radar_data' | 'gap_report'>[]> {
    try {
      this.logger.log(
        `Fetching all match history for user ID: ${userId} based on default CV`,
      );

      const matches = await this.prisma.cvJobMatch.findMany({
        where: {
          cv: {
            default_for_user: {
              user_id: userId,
            },
          },
        },
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

  private handleError(error: unknown, context: string) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    const stack = error instanceof Error ? error.stack : '';
    this.logger.error(
      `Matching service [${context}] failed: ${message}`,
      stack,
    );
  }
}
