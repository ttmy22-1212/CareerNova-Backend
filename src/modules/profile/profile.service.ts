import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import * as bcrypt from 'bcrypt';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { ChangePasswordDto } from './dto/change-profile.dto';
import { UpdateOnboardingProgressDto } from './dto/update-onboarding-progress.dto';
import { v2 as cloudinary, UploadApiResponse } from 'cloudinary';
import * as streamifier from 'streamifier';
import PDFDocument from 'pdfkit';
import * as fs from 'fs';

type PdfFonts = {
  regular: string;
  bold: string;
};

type MatchSkillSummary = {
  skill_name?: string;
  weight?: number;
  similarity?: number;
  gap?: number;
  matched_via?: string;
  contribution?: number;
};

type MatchGapReport = {
  missing_skills?: MatchSkillSummary[];
  partially_matched_skills?: MatchSkillSummary[];
};

const majorLabels: Record<string, string> = {
  CS: 'Khoa học Máy tính',
  SE: 'Kỹ thuật Phần mềm',
  IS: 'Hệ thống Thông tin',
  IT: 'Công nghệ Thông tin',
  AI: 'Trí tuệ Nhân tạo',
  DA: 'Phân tích Dữ liệu',
  Other: 'Ngành khác',
};

const interestLabels: Record<string, string> = {
  frontend: 'Frontend',
  backend: 'Backend',
  fullstack: 'Fullstack',
  mobile: 'Mobile',
  data: 'Data',
  ai_ml: 'AI / ML',
  devops: 'DevOps',
  cybersecurity: 'Security',
  qa: 'QA / Test',
};

const goalLabels: Record<string, string> = {
  internship: 'Tìm thực tập',
  fulltime: 'Tìm việc fulltime',
  switch: 'Chuyển hướng',
  explore: 'Đang khám phá',
};

@Injectable()
export class ProfileService {
  private readonly logger = new Logger(ProfileService.name);

  constructor(
    private prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {
    cloudinary.config({
      cloud_name: this.configService.get<string>('CLOUDINARY_CLOUD_NAME'),
      api_key: this.configService.get<string>('CLOUDINARY_API_KEY'),
      api_secret: this.configService.get<string>('CLOUDINARY_API_SECRET'),
    });
  }

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
        allow_default_cv_matching: true,
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
        default_match: {
          include: {
            job: {
              select: {
                job_posting_url: true,
              },
            },
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
        job_posting_url: dm.job?.job_posting_url || null,
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
        allow_default_cv_matching: user.allow_default_cv_matching,
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

  async resetOnboarding(userId: string) {
    this.logger.warn(`Resetting onboarding data for user ID: ${userId}`);

    try {
      const result = await this.prisma.$transaction(async (tx) => {
        const deletedVirtualCvs = await tx.userCv.deleteMany({
          where: {
            user_id: userId,
            file_url: 'internal://onboarding_virtual_cv',
          },
        });

        const updatedUser = await tx.user.update({
          where: { user_id: userId },
          data: {
            major: null,
            school: null,
            current_year: null,
            orientation: null,
            objective: null,
            target_salary: null,
            prefer_remote: false,
            current_step: 1,
            onboarding_completed: false,
            updated_at: new Date(),
          },
          select: {
            user_id: true,
            current_step: true,
            onboarding_completed: true,
          },
        });

        return { updatedUser, deletedVirtualCvs };
      });

      return {
        message: 'ONBOARDING_RESET_SUCCESSFULLY',
        current_step: result.updatedUser.current_step,
        onboarding_completed: result.updatedUser.onboarding_completed,
        deleted_virtual_cvs: result.deletedVirtualCvs.count,
      };
    } catch (caughtError: unknown) {
      const error =
        caughtError instanceof Error ? caughtError : new Error('UNKNOWN_ERROR');
      this.logger.error(
        `Failed to reset onboarding for user ID: ${userId}`,
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
          major: true,
          school: true,
          current_year: true,
          orientation: true,
          objective: true,
          target_salary: true,
          prefer_remote: true,
          current_step: true,
          onboarding_completed: true,
          allow_default_cv_matching: true,
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

  async getSavedCourses(userId: string) {
    this.logger.log(`Fetching saved courses for user ID: ${userId}`);

    try {
      const savedCourses = await this.prisma.savedCourse.findMany({
        where: { user_id: userId },
        orderBy: { created_at: 'desc' },
        include: {
          course: {
            include: {
              paths_included: {
                include: {
                  path: true,
                },
              },
            },
          },
        },
      });

      return savedCourses.map((item) => ({
        course_id: item.course.course_id,
        saved_at: item.created_at,
        status: item.status,

        course: {
          course_id: item.course.course_id,
          course_title: item.course.course_title,
          provider_name: item.course.provider_name,
          source_url: item.course.source_url,
          thumbnail_icon: item.course.thumbnail_icon,
          duration_hours: item.course.duration_hours,
          rating: Number(item.course.rating),
          total_learners: item.course.total_learners,
          price: Number(item.course.price),
          currency: item.course.currency,
          skills_tags: item.course.skills_tags,
          is_recommended: item.course.is_recommended,

          learning_paths: item.course.paths_included.map((pc) => ({
            path_id: pc.path.path_id,
            path_title: pc.path.path_title,
            path_level: pc.path.path_level,
            skill_key: pc.path.skill_key,
          })),
        },
      }));
    } catch (error: unknown) {
      this.logger.error(
        `Error fetching saved courses: ${(error as Error).message}`,
      );

      throw new BadRequestException('FAILED_TO_FETCH_SAVED_COURSES');
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

    const cv = await this.prisma.userCv.findFirst({
      where: { cv_id: cvId, user_id: userId },
    });

    if (!cv) {
      throw new NotFoundException('CV_NOT_FOUND_OR_UNAUTHORIZED');
    }

    const highestMatch = await this.prisma.cvJobMatch.findFirst({
      where: { cv_id: cvId },
      orderBy: { match_score: 'desc' },
      select: { match_id: true },
    });

    const defaultMatchId = highestMatch ? highestMatch.match_id : null;

    await this.prisma.user.update({
      where: { user_id: userId },
      data: {
        default_cv_id: cvId,
        default_match_id: defaultMatchId,
      },
    });

    return {
      message: 'DEFAULT_CV_SET_SUCCESSFULLY',
      default_cv_id: cvId,
      default_match_id: defaultMatchId,
    };
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

  async uploadAvatar(userId: string, file: Express.Multer.File) {
    try {
      if (!file) {
        throw new BadRequestException('AVATAR_FILE_IS_REQUIRED');
      }

      const originalname = Buffer.from(file.originalname, 'latin1').toString(
        'utf8',
      );
      file.originalname = originalname;

      this.logger.log(
        `User ID ${userId} is uploading a new avatar: ${file.originalname}`,
      );

      // 1. Upload file ảnh lên Cloudinary bằng Stream
      const result = await this.uploadAvatarToCloudinary(file);
      const avatarUrl = result.secure_url || result.url;

      if (!avatarUrl) {
        this.logger.error(
          `Cloudinary upload succeeded but did not return an avatar URL for user ${userId}`,
        );
        throw new BadRequestException('AVATAR_URL_MISSING_FROM_STORAGE');
      }

      // 2. Cập nhật đường dẫn URL mới nhận được từ Cloudinary vào DB
      const updatedUser = await this.prisma.user.update({
        where: { user_id: userId },
        data: {
          avatar_url: avatarUrl,
          updated_at: new Date(),
        },
        select: {
          user_id: true,
          full_name: true,
          avatar_url: true,
        },
      });

      this.logger.log(`Avatar updated successfully for user ID: ${userId}`);

      return {
        message: 'AVATAR_UPLOADED_SUCCESSFULLY',
        avatar_url: updatedUser.avatar_url,
        url: updatedUser.avatar_url,
      };
    } catch (error: unknown) {
      if (error instanceof BadRequestException) {
        throw error;
      }

      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Avatar upload failed for user ${userId}: ${message}`);
      throw new BadRequestException('Could not upload avatar image to storage');
    }
  }

  async exportProfilePdf(userId: string): Promise<Buffer> {
    this.logger.log(`Exporting profile PDF for user ID: ${userId}`);

    const user = await this.prisma.user.findUnique({
      where: { user_id: userId },
      select: {
        user_id: true,
        full_name: true,
        email: true,
        role: true,
        major: true,
        school: true,
        current_year: true,
        orientation: true,
        objective: true,
        target_salary: true,
        prefer_remote: true,
        onboarding_completed: true,
        allow_default_cv_matching: true,
        created_at: true,
        default_cv_id: true,
        default_match_id: true,
        auth_providers: {
          select: { provider: true, last_login_at: true },
        },
        default_cv: {
          include: {
            cv_skills: {
              include: { skill: true },
            },
          },
        },
        cvs: {
          orderBy: { uploaded_at: 'desc' },
          include: {
            cv_skills: {
              include: { skill: true },
            },
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundException('USER_NOT_FOUND');
    }

    const matches = await this.prisma.cvJobMatch.findMany({
      where: { cv: { user_id: userId } },
      orderBy: { created_at: 'desc' },
      include: {
        cv: {
          select: {
            cv_id: true,
            file_name: true,
            uploaded_at: true,
          },
        },
        job: {
          select: {
            job_id: true,
            title: true,
            job_posting_url: true,
            job_category: true,
            search_group: true,
            location: true,
            work_type: true,
            is_remote: true,
            company: {
              select: {
                name: true,
                city: true,
                country: true,
              },
            },
          },
        },
      },
    });

    return this.renderProfilePdf(user, matches);
  }

  /**
   * Helper kết nối luồng streamifier đẩy dữ liệu buffer của ảnh lên Cloudinary
   */
  private uploadAvatarToCloudinary(
    file: Express.Multer.File,
  ): Promise<UploadApiResponse> {
    if (!file || !file.buffer) {
      return Promise.reject(
        new Error('File buffer is missing! Check your Multer configuration.'),
      );
    }
    return new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder: 'avatars',
          resource_type: 'image',
          public_id: `${Date.now()}-${file.originalname.split('.')[0]}`,
          use_filename: true,
          unique_filename: true,
          access_mode: 'public',
        },
        (error, result: UploadApiResponse | undefined) => {
          if (error || !result) {
            return reject(
              new Error(error?.message || 'Unknown Cloudinary error'),
            );
          }
          resolve(result);
        },
      );

      const fileStream = streamifier.createReadStream(file.buffer);
      fileStream.on('error', (err) => reject(err));

      fileStream.pipe(uploadStream);
    });
  }

  private renderProfilePdf(user: any, matches: any[]): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const doc = new PDFDocument({
        size: 'A4',
        margin: 44,
        bufferPages: true,
        info: {
          Title: 'Hồ sơ Career Nova',
          Author: 'Career Nova',
          Subject: 'Hồ sơ người dùng và lịch sử matching',
        },
      });
      const chunks: Buffer[] = [];
      const fonts = this.registerPdfFonts(doc);

      doc.on('data', (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      this.drawPdfHeader(doc, fonts, user);
      this.drawProfileOverview(doc, fonts, user);
      this.drawCvSummary(doc, fonts, user);
      this.drawMatchingHistory(doc, fonts, user, matches);
      this.drawPdfFooters(doc, fonts);

      doc.end();
    });
  }

  private registerPdfFonts(doc: PDFKit.PDFDocument): PdfFonts {
    const regularPath = this.findExistingFile([
      // Linux (production)
      '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
      '/usr/share/fonts/ttf-dejavu/DejaVuSans.ttf',
      '/usr/share/fonts/truetype/ubuntu/Ubuntu-R.ttf',
      '/usr/share/fonts/truetype/ubuntu/Ubuntu[wdth,wght].ttf',
      // Windows (development)
      'C:\\Windows\\Fonts\\segoeui.ttf',
      'C:\\Windows\\Fonts\\arial.ttf',
      'C:\\Windows\\Fonts\\calibri.ttf',
    ]);
    const boldPath = this.findExistingFile([
      // Linux (production)
      '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
      '/usr/share/fonts/ttf-dejavu/DejaVuSans-Bold.ttf',
      '/usr/share/fonts/truetype/ubuntu/Ubuntu-B.ttf',
      '/usr/share/fonts/truetype/ubuntu/UbuntuSans[wdth,wght].ttf',
      // Windows (development)
      'C:\\Windows\\Fonts\\segoeuib.ttf',
      'C:\\Windows\\Fonts\\arialbd.ttf',
      'C:\\Windows\\Fonts\\calibrib.ttf',
    ]);

    if (regularPath) {
      doc.registerFont('NovaRegular', regularPath);
    }
    if (boldPath) {
      doc.registerFont('NovaBold', boldPath);
    }

    return {
      regular: regularPath ? 'NovaRegular' : 'Helvetica',
      bold: boldPath ? 'NovaBold' : 'Helvetica-Bold',
    };
  }

  private findExistingFile(paths: string[]): string | null {
    return paths.find((filePath) => fs.existsSync(filePath)) || null;
  }

  private drawPdfHeader(doc: PDFKit.PDFDocument, fonts: PdfFonts, user: any) {
    doc.rect(0, 0, doc.page.width, 118).fill('#eff6ff');
    doc.rect(0, 0, doc.page.width, 10).fill('#2563eb');

    doc
      .font(fonts.bold)
      .fontSize(22)
      .fillColor('#0f172a')
      .text('Hồ sơ Career Nova', 44, 26, { width: 420 });

    doc
      .font(fonts.regular)
      .fontSize(9)
      .fillColor('#2563eb')
      .text('Phân tích kỹ năng & việc làm IT', 44, 54);

    doc
      .font(fonts.regular)
      .fontSize(10)
      .fillColor('#475569')
      .text(
        `Ứng viên: ${this.valueOrEmpty(user.full_name)}  ·  ${this.valueOrEmpty(user.email)}`,
        44,
        72,
        { width: 500 },
      )
      .text(`Xuất lúc: ${this.formatDateTime(new Date())}`, 44, 90);

    doc.y = 146;
  }

  private drawProfileOverview(
    doc: PDFKit.PDFDocument,
    fonts: PdfFonts,
    user: any,
  ) {
    const { interests, suggestedPaths } = this.parseOrientation(
      user.orientation,
    );

    this.drawPdfSectionTitle(doc, fonts, 'Thông tin hồ sơ');
    this.drawPdfRow(doc, fonts, 'Trường', user.school);
    this.drawPdfRow(
      doc,
      fonts,
      'Ngành học',
      user.major ? majorLabels[user.major] || user.major : null,
    );
    this.drawPdfRow(
      doc,
      fonts,
      'Năm học',
      user.current_year ? `Năm ${user.current_year}` : null,
    );
    this.drawPdfRow(
      doc,
      fonts,
      'Định hướng quan tâm',
      this.formatList(interests.map((item) => interestLabels[item] || item)),
    );
    this.drawPdfRow(
      doc,
      fonts,
      'Lộ trình gợi ý',
      this.formatList(
        suggestedPaths.map((item) => interestLabels[item] || item),
      ),
    );
    this.drawPdfRow(
      doc,
      fonts,
      'Mục tiêu',
      user.objective ? goalLabels[user.objective] || user.objective : null,
    );
    this.drawPdfRow(
      doc,
      fonts,
      'Lương mong muốn',
      user.target_salary
        ? `${Number(user.target_salary).toLocaleString('vi-VN')} USD`
        : null,
    );
    this.drawPdfRow(
      doc,
      fonts,
      'Ưu tiên remote',
      user.prefer_remote ? 'Có' : 'Không',
    );
  }

  private drawCvSummary(doc: PDFKit.PDFDocument, fonts: PdfFonts, user: any) {
    this.drawPdfSectionTitle(doc, fonts, 'CV và kỹ năng');

    if (user.default_cv) {
      this.drawPdfRow(doc, fonts, 'CV mặc định', user.default_cv.file_name);
      const cvSkillNames = (user.default_cv.cv_skills || [])
        .map((item: any) => item.skill?.skill_name)
        .filter(Boolean);
      this.drawPdfTags(
        doc,
        fonts,
        'Kỹ năng trong CV mặc định',
        cvSkillNames,
        { bg: '#dbeafe', text: '#1d4ed8' },
      );
    } else {
      this.drawPdfParagraph(
        doc,
        fonts,
        'Chưa có CV mặc định. Người dùng cần chọn CV mặc định để hệ thống phân tích skill gap và đề xuất tốt hơn.',
      );
    }

    const cvNames = (user.cvs || []).map((cv: any) => {
      const suffix =
        cv.cv_id === user.default_cv_id
          ? ' (mặc định)'
          : cv.uploaded_at
            ? ` (${this.formatDate(cv.uploaded_at)})`
            : '';
      return `${cv.file_name || 'CV chưa đặt tên'}${suffix}`;
    });
    this.drawPdfRow(doc, fonts, 'Tất cả CV', this.formatList(cvNames));
  }

  private drawMatchingHistory(
    doc: PDFKit.PDFDocument,
    fonts: PdfFonts,
    user: any,
    matches: any[],
  ) {
    this.drawPdfSectionTitle(doc, fonts, 'Chi tiết lịch sử matching');
    this.drawPdfParagraph(
      doc,
      fonts,
      `Tổng số lượt matching: ${matches.length.toLocaleString('vi-VN')}. ${
        user.default_match_id
          ? 'Lượt có nhãn “mặc định” đang được dùng cho dashboard/phân tích chính.'
          : 'Chưa chọn lượt matching mặc định.'
      }`,
    );

    if (matches.length === 0) {
      this.drawPdfParagraph(
        doc,
        fonts,
        'Chưa có dữ liệu matching. Hãy chạy matching CV với nhóm nghề hoặc URL công việc để tạo báo cáo.',
      );
      return;
    }

    matches.forEach((match, index) => {
      this.drawMatchDetail(doc, fonts, match, index + 1, user.default_match_id);
    });
  }

  private drawMatchDetail(
    doc: PDFKit.PDFDocument,
    fonts: PdfFonts,
    match: any,
    index: number,
    defaultMatchId?: string | null,
  ) {
    const target = this.getMatchTarget(match);
    const isDefault = defaultMatchId === match.match_id;
    const gapReport = (match.gap_report || {}) as MatchGapReport;
    const matchedSkills = Array.isArray(match.radar_data)
      ? (match.radar_data as MatchSkillSummary[])
      : [];
    const partialSkills = Array.isArray(gapReport.partially_matched_skills)
      ? gapReport.partially_matched_skills
      : [];
    const missingSkills = Array.isArray(gapReport.missing_skills)
      ? gapReport.missing_skills
      : [];

    this.ensurePdfSpace(doc, 150);
    const headerY = doc.y;
    const headerW = doc.page.width - 88;
    doc
      .roundedRect(44, headerY, headerW, 34, 8)
      .fill(isDefault ? '#dbeafe' : '#f8fafc');

    // Badge điểm phù hợp (góc phải header), màu theo mức điểm
    const scoreText = this.formatMatchScore(match.match_score);
    let titleWidth = headerW - 28;
    if (scoreText !== 'Chưa có dữ liệu') {
      const numeric = Number(match.match_score);
      const pct = Number.isFinite(numeric)
        ? numeric <= 1
          ? numeric * 100
          : numeric
        : 0;
      const scheme =
        pct >= 80
          ? { bg: '#dcfce7', text: '#15803d' }
          : pct >= 65
            ? { bg: '#dbeafe', text: '#1d4ed8' }
            : { bg: '#fef3c7', text: '#b45309' };
      doc.font(fonts.bold).fontSize(9);
      const bw = doc.widthOfString(scoreText) + 16;
      const bx = 44 + headerW - bw - 12;
      doc.roundedRect(bx, headerY + 8, bw, 18, 6).fill(scheme.bg);
      doc
        .fillColor(scheme.text)
        .text(scoreText, bx + 8, headerY + 11, { lineBreak: false });
      titleWidth = headerW - bw - 44;
    }

    doc
      .font(fonts.bold)
      .fontSize(11)
      .fillColor(isDefault ? '#1d4ed8' : '#0f172a')
      .text(
        `#${index} ${target}${isDefault ? ' — mặc định' : ''}`,
        58,
        headerY + 11,
        { width: titleWidth, lineBreak: false, ellipsis: true },
      );
    doc.y = headerY + 44;

    this.drawPdfRow(doc, fonts, 'CV sử dụng', match.cv?.file_name);
    this.drawPdfRow(
      doc,
      fonts,
      'Thời điểm chạy',
      this.formatDateTime(match.created_at),
    );
    this.drawPdfRow(doc, fonts, 'Nhóm nghề', match.search_group);
    this.drawPdfRow(doc, fonts, 'Công ty', match.job?.company?.name);
    this.drawPdfRow(doc, fonts, 'Địa điểm', match.job?.location);
    this.drawPdfRow(doc, fonts, 'Hình thức', this.formatWorkType(match));

    const matchedTags = [...matchedSkills]
      .sort((a, b) => Number(b.contribution || 0) - Number(a.contribution || 0))
      .slice(0, 14)
      .map((s) =>
        s.similarity != null
          ? `${this.valueOrEmpty(s.skill_name)}  ${this.formatPercentValue(s.similarity)}`
          : this.valueOrEmpty(s.skill_name),
      );
    const partialTags = [...partialSkills]
      .slice(0, 14)
      .map((s) =>
        s.similarity != null
          ? `${this.valueOrEmpty(s.skill_name)}  ${this.formatPercentValue(s.similarity)}`
          : this.valueOrEmpty(s.skill_name),
      );
    const missingTags = [...missingSkills]
      .slice(0, 14)
      .map((s) => this.valueOrEmpty(s.skill_name));

    this.drawPdfTags(doc, fonts, 'Kỹ năng đã khớp tốt', matchedTags, {
      bg: '#dcfce7',
      text: '#15803d',
    });
    this.drawPdfTags(doc, fonts, 'Kỹ năng khớp một phần', partialTags, {
      bg: '#fef3c7',
      text: '#b45309',
    });
    this.drawPdfTags(doc, fonts, 'Kỹ năng còn thiếu', missingTags, {
      bg: '#fee2e2',
      text: '#b91c1c',
    });

    doc.moveDown(0.5);
  }

  private drawPdfSectionTitle(
    doc: PDFKit.PDFDocument,
    fonts: PdfFonts,
    title: string,
  ) {
    this.ensurePdfSpace(doc, 58);
    doc
      .font(fonts.bold)
      .fontSize(14)
      .fillColor('#1d4ed8')
      .text(title, 44, doc.y);
    doc
      .moveTo(44, doc.y + 5)
      .lineTo(doc.page.width - 44, doc.y + 5)
      .strokeColor('#bfdbfe')
      .lineWidth(1)
      .stroke();
    doc.moveDown(1.1);
  }

  private drawPdfRow(
    doc: PDFKit.PDFDocument,
    fonts: PdfFonts,
    label: string,
    rawValue: unknown,
  ) {
    const value = this.valueOrEmpty(rawValue);
    const labelX = 44;
    const valueX = 184;
    const valueWidth = doc.page.width - valueX - 44;
    const estimatedLines = Math.max(1, Math.ceil(value.length / 72));

    this.ensurePdfSpace(doc, Math.max(32, estimatedLines * 16 + 12));
    const startY = doc.y;

    doc
      .font(fonts.bold)
      .fontSize(9)
      .fillColor('#64748b')
      .text(label, labelX, doc.y, { width: 120 });

    doc
      .font(fonts.regular)
      .fontSize(10)
      .fillColor('#0f172a')
      .text(value, valueX, startY, {
        width: valueWidth,
        lineGap: 2,
      });

    doc.y = Math.max(doc.y, startY + 17);
    doc
      .moveTo(44, doc.y + 5)
      .lineTo(doc.page.width - 44, doc.y + 5)
      .strokeColor('#e2e8f0')
      .lineWidth(0.5)
      .stroke();
    doc.moveDown(0.65);
  }

  private drawPdfParagraph(
    doc: PDFKit.PDFDocument,
    fonts: PdfFonts,
    text: string,
  ) {
    this.ensurePdfSpace(doc, 42);
    doc
      .font(fonts.regular)
      .fontSize(10)
      .fillColor('#334155')
      .text(text, 44, doc.y, {
        width: doc.page.width - 88,
        lineGap: 3,
      });
    doc.moveDown(0.9);
  }

  /**
   * Vẽ một danh sách kỹ năng dưới dạng "pill" (thẻ bo tròn có màu), tự xuống
   * dòng và sang trang khi tràn — đẹp và dễ đọc hơn danh sách gạch đầu dòng.
   */
  private drawPdfTags(
    doc: PDFKit.PDFDocument,
    fonts: PdfFonts,
    title: string,
    items: string[],
    scheme: { bg: string; text: string },
  ) {
    this.ensurePdfSpace(doc, 44);
    doc
      .font(fonts.bold)
      .fontSize(10)
      .fillColor('#0f172a')
      .text(title, 44, doc.y);
    doc.moveDown(0.35);

    if (!items.length) {
      doc
        .font(fonts.regular)
        .fontSize(9.5)
        .fillColor('#94a3b8')
        .text('Chưa có dữ liệu.', 58, doc.y);
      doc.moveDown(0.5);
      return;
    }

    const startX = 58;
    const maxX = doc.page.width - 44;
    const padX = 7;
    const fontSize = 8.5;
    const pillH = 16;
    const rowGap = 6;
    const colGap = 6;

    this.ensurePdfSpace(doc, pillH + rowGap);
    let x = startX;
    let y = doc.y;
    doc.font(fonts.regular).fontSize(fontSize);

    for (const raw of items) {
      const label = String(raw);
      const w = doc.widthOfString(label) + padX * 2;
      // Xuống dòng khi vượt mép phải
      if (x + w > maxX && x > startX) {
        x = startX;
        y += pillH + rowGap;
        const bottom = doc.page.height - doc.page.margins.bottom - 36;
        if (y + pillH > bottom) {
          doc.addPage();
          doc.rect(0, 0, doc.page.width, 8).fill('#2563eb');
          y = 42;
        }
      }
      doc.roundedRect(x, y, w, pillH, 4).fill(scheme.bg);
      doc
        .fillColor(scheme.text)
        .font(fonts.regular)
        .fontSize(fontSize)
        .text(label, x + padX, y + 4, { lineBreak: false });
      x += w + colGap;
    }

    doc.y = y + pillH + rowGap;
    doc.moveDown(0.3);
  }

  private drawPdfFooters(doc: PDFKit.PDFDocument, fonts: PdfFonts) {
    const range = doc.bufferedPageRange();
    for (
      let pageIndex = range.start;
      pageIndex < range.start + range.count;
      pageIndex += 1
    ) {
      doc.switchToPage(pageIndex);

      // Reset doc.y to a safe position above maxY before each text call so
      // PDFKit never triggers an implicit addPage() when drawing the footer.
      const safeY = doc.page.height - doc.page.margins.bottom - 20;
      const footerY = doc.page.height - 34;

      doc.font(fonts.regular).fontSize(8).fillColor('#64748b');

      doc.y = safeY;
      doc.text('Career Nova', 44, footerY, { width: 220, lineBreak: false });

      doc.y = safeY;
      doc.text(`Trang ${pageIndex + 1}/${range.count}`, 44, footerY, {
        width: doc.page.width - 88,
        align: 'right',
        lineBreak: false,
      });
    }
  }

  private ensurePdfSpace(doc: PDFKit.PDFDocument, neededHeight: number) {
    const bottom = doc.page.height - doc.page.margins.bottom - 36;
    if (doc.y + neededHeight > bottom) {
      doc.addPage();
      doc.rect(0, 0, doc.page.width, 8).fill('#2563eb');
      doc.y = 42;
    }
  }

  private parseOrientation(orientation?: string | null): {
    interests: string[];
    suggestedPaths: string[];
  } {
    const [selectedRaw = '', suggestedRaw = ''] = (orientation || '').split(
      '|',
    );
    return {
      interests: selectedRaw
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean),
      suggestedPaths: suggestedRaw
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean),
    };
  }

  private getMatchTarget(match: any): string {
    if (match.match_type === 'cv_job') {
      return (
        match.job?.title ||
        match.job?.job_posting_url ||
        match.search_group ||
        'Công việc cụ thể'
      );
    }
    return match.search_group || match.job?.job_category || 'Nhóm nghề';
  }

  private formatWorkType(match: any): string {
    const values = [
      match.job?.work_type,
      match.job?.is_remote ? 'Remote' : null,
    ].filter(Boolean);
    return this.formatList(values);
  }

  private formatMatchScore(score: unknown): string {
    if (score == null) return 'Chưa có dữ liệu';
    const numericScore = Number(score);
    if (!Number.isFinite(numericScore)) return 'Chưa có dữ liệu';
    const percent = numericScore <= 1 ? numericScore * 100 : numericScore;
    return `${Math.round(percent)}%`;
  }

  private formatPercentValue(value: unknown): string {
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) return 'N/A';
    const percent =
      Math.abs(numericValue) <= 1 ? numericValue * 100 : numericValue;
    return `${Math.round(percent)}%`;
  }

  private formatList(values: unknown[]): string {
    const cleaned = values
      .map((value) => (value == null ? '' : String(value).trim()))
      .filter(Boolean);
    return cleaned.length > 0 ? cleaned.join(', ') : 'Chưa cập nhật';
  }

  private valueOrEmpty(value: unknown): string {
    if (value == null) return 'Chưa cập nhật';
    const normalized = String(value).trim();
    return normalized || 'Chưa cập nhật';
  }

  private formatDate(value: unknown): string {
    if (!value) return 'Chưa cập nhật';
    const date = new Date(value as string | number | Date);
    if (Number.isNaN(date.getTime())) return 'Chưa cập nhật';
    return date.toLocaleDateString('vi-VN');
  }

  private formatDateTime(value: unknown): string {
    if (!value) return 'Chưa cập nhật';
    const date = new Date(value as string | number | Date);
    if (Number.isNaN(date.getTime())) return 'Chưa cập nhật';
    return date.toLocaleString('vi-VN');
  }
}
