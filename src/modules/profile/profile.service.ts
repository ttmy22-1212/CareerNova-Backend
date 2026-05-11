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
      latest_match_summary: latestMatchSummary,
    };
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
    } catch (error) {
      this.logger.error(
        `Failed to update profile for user ID: ${userId}`,
        (error as Error).stack,
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
    } catch (error) {
      this.logger.error(
        `Failed to delete account for user ID: ${userId}`,
        (error as Error).stack,
      );
      throw error;
    }
  }
}
