import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import * as bcrypt from 'bcrypt';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { ChangePasswordDto } from './dto/change-profile.dto';
import { UpdateOnboardingProgressDto } from './dto/update-onboarding-progress.dto';

@Injectable()
export class ProfileService {
  private readonly logger = new Logger(ProfileService.name);

  constructor(private prisma: PrismaService) {}

  async getMe(userId: string) {
    this.logger.log(`Fetching profile data for user ID: ${userId}`);

    const user = await this.prisma.user.findUnique({
      where: { user_id: userId },
      select: {
        user_id: true,
        full_name: true,
        email: true,
        avatar_url: true,
        role: true,
        major: true,
        school: true,
        current_year: true,
        orientation: true,
        objective: true,
        target_salary: true,
        prefer_remote: true,
        current_step: true,
        onboarding_completed: true,
        created_at: true,
        auth_providers: {
          select: { provider: true, last_login_at: true },
        },
        cvs: {
          orderBy: { uploaded_at: 'desc' },
          include: {
            cv_skills: {
              include: {
                skill: true,
              },
            },
          },
        },
        default_cv: {
          include: {
            cv_skills: {
              include: {
                skill: true,
              },
            },
          },
        },
        default_match: true,
      },
    });

    if (!user) {
      this.logger.warn(`Get profile failed: User ID ${userId} not found`);
      throw new NotFoundException('USER_NOT_FOUND');
    }

    const latestCv = user.cvs[0] || null;

    const latestMatchSummary = latestCv
      ? await this.prisma.cvJobMatch.findFirst({
          where: { cv_id: latestCv.cv_id },
          orderBy: { created_at: 'desc' },
          include: {
            job: {
              select: {
                job_id: true,
                company_id: true,
                title: true,
                company: { select: { name: true } },
              },
            },
          },
        })
      : null;

    const defaultCvSummary = user.default_cv
      ? {
          cv_id: user.default_cv.cv_id,
          file_name: user.default_cv.file_name,
          file_url: user.default_cv.file_url,
          uploaded_at: user.default_cv.uploaded_at,
          skills: (user.default_cv.cv_skills || []).map(
            (s) => s.skill.skill_name,
          ),
        }
      : null;

    let defaultMatchSummary: Record<string, any> | null = null;
    if (user.default_match) {
      const dm = user.default_match;
      defaultMatchSummary = {
        match_id: this.stringifyId(dm.match_id),
        cv_id: this.stringifyId(dm.cv_id),
        job_id: this.stringifyId(dm.job_id),
        match_type: dm.match_type,
        search_group: dm.search_group,
        match_score: dm.match_score ? Number(dm.match_score) : null,
        radar_data: dm.radar_data as Record<string, any>[],
        gap_report: dm.gap_report as Record<string, any>,
        model_version: dm.model_version,
        created_at: dm.created_at,
        updated_at: dm.updated_at,
      };
    }

    this.logger.log(`Successfully retrieved profile for ${user.email}`);

    return {
      user: {
        user_id: user.user_id,
        full_name: user.full_name,
        email: user.email,
        avatar_url: user.avatar_url,
        role: user.role,
        major: user.major,
        school: user.school,
        current_year: user.current_year,
        orientation: user.orientation,
        objective: user.objective,
        target_salary: user.target_salary,
        prefer_remote: user.prefer_remote,
        current_step: user.current_step,
        onboarding_completed: user.onboarding_completed,
      },
      auth_providers: user.auth_providers,
      created_at: user.created_at
        ? new Date(user.created_at).getTime()
        : Date.now(),
      all_cvs: user.cvs.map((cv) => ({
        cv_id: cv.cv_id,
        file_name: cv.file_name,
        file_url: cv.file_url,
        uploaded_at: cv.uploaded_at,
        skills: cv.cv_skills.map((s) => s.skill.skill_name),
      })),
      default_cv: defaultCvSummary,
      default_match: defaultMatchSummary,
      latest_cv: latestCv
        ? {
            cv_id: latestCv.cv_id,
            file_name: latestCv.file_name,
            uploaded_at: latestCv.uploaded_at,
          }
        : null,
      cv_skills_summary:
        latestCv?.cv_skills.map((s) => s.skill.skill_name) || [],
      latest_match_summary: latestMatchSummary
        ? {
            ...latestMatchSummary,
            // Ép kiểu match_id nếu nó là BigInt
            match_id: this.stringifyId(latestMatchSummary.match_id),
            cv_id: this.stringifyId(latestMatchSummary.cv_id),
            job_id: this.stringifyId(latestMatchSummary.job_id),
            // Ép kiểu job object bên trong
            job: latestMatchSummary.job
              ? {
                  ...latestMatchSummary.job,
                  job_id: this.stringifyId(latestMatchSummary.job.job_id),
                  company_id: this.stringifyId(
                    latestMatchSummary.job.company_id,
                  ),
                }
              : null,
          }
        : null,
    };
  }

  private stringifyId(value: unknown): string | null {
    // eslint-disable-next-line @typescript-eslint/no-base-to-string
    return value != null ? String(value) : null;
  }

  async getOnboardingStatus(userId: string) {
    this.logger.log(`Checking onboarding status for user ID: ${userId}`);

    const user = await this.prisma.user.findUnique({
      where: { user_id: userId },
      select: {
        current_step: true,
        onboarding_completed: true,
      },
    });

    if (!user) {
      throw new NotFoundException('USER_NOT_FOUND');
    }

    return {
      onboarding_completed: user.onboarding_completed,
      current_step: user.current_step,
    };
  }

  async updateOnboardingProgress(
    userId: string,
    dto: UpdateOnboardingProgressDto,
  ) {
    this.logger.log(
      `Updating onboarding step ${dto.current_step} for user ID: ${userId}`,
    );

    try {
      const updatedUser = await this.prisma.user.update({
        where: { user_id: userId },
        data: {
          current_step: dto.current_step,
          // Chỉ cập nhật nếu FE truyền lên (tránh đè null vào dữ liệu cũ của bước trước)
          ...(dto.major !== undefined && { major: dto.major }),
          ...(dto.school !== undefined && { school: dto.school }),
          ...(dto.current_year !== undefined && {
            current_year: dto.current_year,
          }),
          ...(dto.orientation !== undefined && {
            orientation: dto.orientation,
          }),
          ...(dto.objective !== undefined && { objective: dto.objective }),
          ...(dto.target_salary !== undefined && {
            target_salary: dto.target_salary,
          }),
          ...(dto.prefer_remote !== undefined && {
            prefer_remote: dto.prefer_remote,
          }),
          updated_at: new Date(),
        },
        select: {
          user_id: true,
          current_step: true,
        },
      });

      return {
        message: 'PROGRESS_UPDATED_SUCCESSFULLY',
        current_step: updatedUser.current_step,
      };
    } catch (caughtError: unknown) {
      const error =
        caughtError instanceof Error ? caughtError : new Error('UNKNOWN_ERROR');
      this.logger.error(
        `Failed to update onboarding progress for user ID: ${userId}`,
        error.stack,
      );
      throw error;
    }
  }

  async completeOnboarding(userId: string) {
    this.logger.log(`Finalizing onboarding for user ID: ${userId}`);

    try {
      await this.prisma.user.update({
        where: { user_id: userId },
        data: {
          current_step: 5,
          onboarding_completed: true,
          updated_at: new Date(),
        },
      });

      this.logger.log(
        `User ID ${userId} has successfully completed onboarding.`,
      );
      return {
        message: 'ONBOARDING_FLOW_COMPLETED',
        onboarding_completed: true,
      };
    } catch (caughtError: unknown) {
      const error =
        caughtError instanceof Error ? caughtError : new Error('UNKNOWN_ERROR');
      this.logger.error(
        `Failed to finalize onboarding for user ID: ${userId}`,
        error.stack,
      );
      throw error;
    }
  }

  async updateProfile(userId: string, dto: UpdateProfileDto) {
    this.logger.log(`Updating profile for user ID: ${userId}`);

    try {
      const updatedUser = await this.prisma.user.update({
        where: { user_id: userId },
        data: {
          ...dto,
          updated_at: new Date(),
        },
        select: {
          user_id: true,
          full_name: true,
          avatar_url: true,
          updated_at: true,
        },
      });

      this.logger.log(`Profile updated successfully for user ID: ${userId}`);
      return updatedUser;
    } catch (caughtError: unknown) {
      const error =
        caughtError instanceof Error ? caughtError : new Error('UNKNOWN_ERROR');
      this.logger.error(
        `Failed to update profile for user ID: ${userId}`,
        error.stack,
      );
      throw error;
    }
  }

  async changePassword(userId: string, dto: ChangePasswordDto) {
    this.logger.log(`Attempting to change password for user ID: ${userId}`);

    const user = await this.prisma.user.findUnique({
      where: { user_id: userId },
    });

    if (!user?.password_hash) {
      this.logger.warn(
        `Change password failed: User ${userId} is a social account`,
      );
      throw new BadRequestException('SOCIAL_ACCOUNT_CANNOT_CHANGE_PASSWORD');
    }

    const isMatch = await bcrypt.compare(
      dto.current_password,
      user.password_hash,
    );

    if (!isMatch) {
      this.logger.warn(
        `Change password failed: Incorrect current password for user ${userId}`,
      );
      throw new UnauthorizedException('CURRENT_PASSWORD_INCORRECT');
    }

    const newHash = await bcrypt.hash(dto.new_password, 10);
    await this.prisma.user.update({
      where: { user_id: userId },
      data: { password_hash: newHash, updated_at: new Date() },
    });

    this.logger.log(`Password changed successfully for user ID: ${userId}`);
    return { message: 'PASSWORD_CHANGED_SUCCESSFULLY' };
  }

  async getActivity(userId: string) {
    this.logger.log(`Fetching activity history for user ID: ${userId}`);

    const [uploadedCvs, recentMatches] = await Promise.all([
      this.prisma.userCv.findMany({
        where: { user_id: userId },
        orderBy: { uploaded_at: 'desc' },
        take: 5,
      }),
      this.prisma.cvJobMatch.findMany({
        where: { cv: { user_id: userId } },
        orderBy: { created_at: 'desc' },
        take: 10,
        include: { job: true },
      }),
    ]);

    this.logger.log(
      `Retrieved ${uploadedCvs.length} CVs and ${recentMatches.length} matches for user ${userId}`,
    );

    return {
      uploaded_cvs: uploadedCvs,
      recent_matches: recentMatches,
      analyzed_jobs: recentMatches.map((m) => m.job).filter(Boolean),
    };
  }

  async deleteAccount(userId: string) {
    this.logger.warn(`ACCOUNT DELETION REQUESTED for user ID: ${userId}`);

    try {
      // Hard delete
      await this.prisma.user.delete({ where: { user_id: userId } });

      this.logger.log(`Account deleted permanently for user ID: ${userId}`);
      return { message: 'ACCOUNT_DELETED_PERMANENTLY' };
    } catch (caughtError: unknown) {
      const error =
        caughtError instanceof Error ? caughtError : new Error('UNKNOWN_ERROR');
      this.logger.error(
        `Failed to delete account for user ID: ${userId}`,
        error.stack,
      );
      throw error;
    }
  }

  async getSavedJobs(userId: string) {
    this.logger.log(`Fetching saved jobs for user ID: ${userId}`);

    const savedJobs = await this.prisma.savedJob.findMany({
      where: { user_id: userId },
      orderBy: { created_at: 'desc' },
      include: {
        job: {
          include: {
            company: {
              select: { name: true, url: true },
            },
          },
        },
      },
    });

    return savedJobs.map((item) => ({
      saved_job_id: item.saved_job_id,
      created_at: item.created_at,
      job: item.job
        ? {
            ...item.job,
            job_id: this.stringifyId(item.job.job_id),
            company_id: this.stringifyId(item.job.company_id),
          }
        : null,
    }));
  }

  async saveJob(userId: string, jobIdStr: string) {
    this.logger.log(`User ID ${userId} is saving job ID: ${jobIdStr}`);

    const jobId = BigInt(jobIdStr);

    const jobExists = await this.prisma.job.findUnique({
      where: { job_id: jobId },
    });

    if (!jobExists) {
      this.logger.warn(`Save job failed: Job ID ${jobIdStr} not found`);
      throw new NotFoundException('JOB_NOT_FOUND');
    }

    try {
      const savedJob = await this.prisma.savedJob.upsert({
        where: {
          user_id_job_id: {
            user_id: userId,
            job_id: jobId,
          },
        },
        update: {},
        create: {
          user_id: userId,
          job_id: jobId,
        },
      });

      return {
        message: 'JOB_SAVED_SUCCESSFULLY',
        saved_job_id: savedJob.saved_job_id,
        job_id: jobIdStr,
      };
    } catch (caughtError: unknown) {
      const error =
        caughtError instanceof Error ? caughtError : new Error('UNKNOWN_ERROR');
      this.logger.error(
        `Failed to save job ${jobIdStr} for user ${userId}`,
        error.stack,
      );
      throw error;
    }
  }

  async deleteSavedJob(userId: string, jobIdStr: string) {
    this.logger.log(`User ID ${userId} is removing saved job ID: ${jobIdStr}`);

    const jobId = BigInt(jobIdStr);

    try {
      await this.prisma.savedJob.delete({
        where: {
          user_id_job_id: {
            user_id: userId,
            job_id: jobId,
          },
        },
      });

      return { message: 'SAVED_JOB_REMOVED_SUCCESSFULLY' };
    } catch (caughtError: unknown) {
      this.logger.warn(
        `Failed to delete saved job: Record not found or database error`,
      );
      throw new NotFoundException(
        'SAVED_JOB_NOT_FOUND_OR_ALREADY_DELETED',
        caughtError instanceof Error
          ? caughtError.message
          : String(caughtError),
      );
    }
  }

  async setDefaultCv(userId: string, cvId: string) {
    this.logger.log(`Setting CV ID ${cvId} as default for user ${userId}`);

    // Kiểm tra xem file CV đó có tồn tại và thuộc về user này không
    const cv = await this.prisma.userCv.findFirst({
      where: { cv_id: cvId, user_id: userId },
    });

    if (!cv) {
      throw new NotFoundException('CV_NOT_FOUND_OR_UNAUTHORIZED');
    }

    // Cập nhật trường mặc định trong bảng User
    await this.prisma.user.update({
      where: { user_id: userId },
      data: { default_cv_id: cvId },
    });

    return { message: 'DEFAULT_CV_SET_SUCCESSFULLY', default_cv_id: cvId };
  }

  async setDefaultMatching(userId: string, matchId: string) {
    this.logger.log(
      `Setting Match ID ${matchId} as default for user ${userId}`,
    );

    // Kiểm tra kết quả đối sánh có tồn tại thông qua mối quan hệ gián tiếp với CV của user
    const match = await this.prisma.cvJobMatch.findFirst({
      where: {
        match_id: matchId,
        cv: {
          user_id: userId,
        },
      },
    });

    if (!match) {
      throw new NotFoundException('MATCH_RECORD_NOT_FOUND_OR_UNAUTHORIZED');
    }

    // Cập nhật trường kết quả mặc định trong bảng User
    await this.prisma.user.update({
      where: { user_id: userId },
      data: { default_match_id: matchId },
    });

    return {
      message: 'DEFAULT_MATCHING_SET_SUCCESSFULLY',
      default_match_id: matchId,
    };
  }
}
