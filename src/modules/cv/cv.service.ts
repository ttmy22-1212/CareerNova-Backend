import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary, UploadApiResponse } from 'cloudinary';
import * as streamifier from 'streamifier';
import { PrismaService } from '../../prisma/prisma.service';
import { CvUploadResponseDto } from './dto/cv-response.dto';
import {
  SyncProfileSkillsDto,
  SyncProfileSkillsResponseDto,
} from './dto/sync-profile-skills.dto';

@Injectable()
export class CvService {
  private readonly logger = new Logger(CvService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {
    cloudinary.config({
      cloud_name: this.configService.get<string>('CLOUDINARY_CLOUD_NAME'),
      api_key: this.configService.get<string>('CLOUDINARY_API_KEY'),
      api_secret: this.configService.get<string>('CLOUDINARY_API_SECRET'),
    });
  }

  async uploadCv(
    userId: string,
    file: Express.Multer.File,
  ): Promise<CvUploadResponseDto> {
    try {
      const { originalname } = file;

      this.logger.log(`User ${userId} is uploading file: ${originalname}`);

      const result = await this.uploadToCloudinary(file);

      const newCv = await this.prisma.userCv.create({
        data: {
          user_id: userId,
          file_name: originalname,
          file_url: result.secure_url,
          extracted_text: null,
        },
      });

      return {
        cv_id: newCv.cv_id,
        file_name: newCv.file_name ?? '',
        file_url: newCv.file_url ?? '',
        uploaded_at: newCv.uploaded_at ?? new Date(),
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Upload failed: ${message}`);
      throw new BadRequestException('Could not upload CV to storage');
    }
  }

  private uploadToCloudinary(
    file: Express.Multer.File,
  ): Promise<UploadApiResponse> {
    return new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder: 'cv_uploads',
          resource_type: 'raw',
          public_id: `${Date.now()}-${file.originalname}`,
          use_filename: true,
          unique_filename: true,
          access_mode: 'public',
        },
        (error, result) => {
          if (error || !result) {
            // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
            return reject(error);
          }
          resolve(result);
        },
      );

      streamifier.createReadStream(file.buffer).pipe(uploadStream);
    });
  }

  async getAllCvs(userId: string): Promise<CvUploadResponseDto[]> {
    try {
      this.logger.log(`Fetching all CVs for user: ${userId}`);

      const cvs = await this.prisma.userCv.findMany({
        where: {
          user_id: userId,
        },
        orderBy: {
          uploaded_at: 'desc',
        },
      });

      return cvs.map((cv) => ({
        cv_id: cv.cv_id,
        file_name: cv.file_name ?? '',
        file_url: cv.file_url ?? '',
        uploaded_at: cv.uploaded_at ?? new Date(),
      }));
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Get all CVs failed: ${message}`);
      throw new BadRequestException('Could not retrieve CVs');
    }
  }

  async syncProfileSkills(
    userId: string,
    dto: SyncProfileSkillsDto,
  ): Promise<SyncProfileSkillsResponseDto> {
    const { cv_id, skills } = dto;
    this.logger.log(
      `Syncing ${skills.length} skills for user ID: ${userId}, CV target: ${cv_id || 'VIRTUAL_CV'}`,
    );

    return await this.prisma.$transaction(async (tx) => {
      let targetCvId = cv_id;

      if (!targetCvId) {
        const now = new Date();

        const formattedDate = `${String(now.getDate()).padStart(2, '0')}-${String(now.getMonth() + 1).padStart(2, '0')}-${now.getFullYear()}_${String(now.getHours()).padStart(2, '0')}h${String(now.getMinutes()).padStart(2, '0')}`;

        const virtualCv = await tx.userCv.create({
          data: {
            user_id: userId,
            file_name: `Onboarding_Virtual_Profile_${formattedDate}.pdf`,
            file_url: 'internal://onboarding_virtual_cv',
            extracted_text:
              'Virtual CV generated from onboarding manually selected skills.',
          },
        });
        targetCvId = virtualCv.cv_id;
      } else {
        const existingCv = await tx.userCv.findFirst({
          where: { cv_id: targetCvId, user_id: userId },
        });
        if (!existingCv) {
          throw new BadRequestException('INVALID_CV_OWNERSHIP');
        }
      }

      await tx.userCvSkill.deleteMany({
        where: { cv_id: targetCvId },
      });

      let insertedCount = 0;

      if (skills && skills.length > 0) {
        for (const skillName of skills) {
          const matchedMasterSkill = await tx.skill.findFirst({
            where: {
              skill_name: {
                equals: skillName,
                mode: 'insensitive',
              },
            },
          });

          if (matchedMasterSkill) {
            await tx.userCvSkill.create({
              data: {
                cv_id: targetCvId,
                skill_id: matchedMasterSkill.skill_id,
              },
            });
            insertedCount++;
          } else {
            this.logger.warn(
              `Skill name "${skillName}" không trùng khớp với bất kỳ từ khóa nào trong Master DB.`,
            );
          }
        }
      }

      await tx.user.update({
        where: { user_id: userId },
        data: { current_step: 4 },
      });

      return {
        message: 'SKILLS_SYNCED_SUCCESSFULLY',
        cv_id: targetCvId,
        synced_count: insertedCount,
      };
    });
  }
}
