import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary, UploadApiResponse } from 'cloudinary';
import * as streamifier from 'streamifier';
import { PrismaService } from '../../prisma/prisma.service';
import { CvUploadResponseDto } from './dto/cv-response.dto';

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
}
