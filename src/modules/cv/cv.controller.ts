import {
  Controller,
  Post,
  UseGuards,
  Req,
  UploadedFile,
  UseInterceptors,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiConsumes,
  ApiBody,
  ApiResponse,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CvService } from './cv.service';
import type { AuthenticatedRequest } from '../auth/interfaces/auth.interface';
import { FileUploadDto } from './dto/cv-upload.dto';
import { CvUploadResponseDto } from './dto/cv-response.dto';

@ApiTags('CV')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Controller('cv')
export class CvController {
  constructor(private readonly cvService: CvService) {}

  @Post('upload')
  @ApiOperation({ summary: 'Upload CV (PDF, DOC, DOCX) - Max 5MB' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    description: 'Chọn file CV từ máy tính',
    type: FileUploadDto,
  })
  @ApiResponse({ status: 201, type: CvUploadResponseDto })
  @UseInterceptors(FileInterceptor('file'))
  async uploadCv(
    @Req() req: AuthenticatedRequest,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('File is required');

    // Validation extension
    const allowedExtensions = ['pdf', 'doc', 'docx'];
    const fileExt = file.originalname.split('.').pop()?.toLowerCase();

    if (!fileExt || !allowedExtensions.includes(fileExt)) {
      throw new BadRequestException('Only PDF, DOC, DOCX are allowed');
    }

    // Validation size (5MB)
    if (file.size > 5 * 1024 * 1024) {
      throw new BadRequestException('File size exceeds 5MB');
    }

    const result = await this.cvService.uploadCv(req.user.sub, file);
    return { data: result };
  }
}
