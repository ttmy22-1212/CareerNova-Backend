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
        current_step: true,
        onboarding_completed: true,
        auth_providers: {
          select: { provider: true, last_login_at: true },
        },
        cvs: {
          orderBy: { uploaded_at: 'desc' },
          take: 1,
          include: {
            cv_skills: { include: { skill: true } },
          },
        },
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
        current_step: user.current_step,
        onboarding_completed: user.onboarding_completed,
      },
      auth_providers: user.auth_providers,
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
}
