import {
  Controller,
  Get,
  Patch,
  Post,
  Delete,
  Body,
  UseGuards,
  Req,
  HttpCode,
  HttpStatus,
  Param,
  UseInterceptors,
  UploadedFile,
  ParseFilePipe,
  MaxFileSizeValidator,
  FileTypeValidator,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiResponse,
  ApiParam,
} from '@nestjs/swagger';
import { ProfileService } from './profile.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { ChangePasswordDto } from './dto/change-profile.dto';
import type { AuthenticatedRequest } from '../auth/interfaces/auth.interface';
import { UpdateOnboardingProgressDto } from './dto/update-onboarding-progress.dto';
import { SaveJobDto } from './dto/save-job.dto';
import {
  SetDefaultCvDto,
  SetDefaultMatchingDto,
} from './dto/update-default.dto';
import { FileInterceptor } from '@nestjs/platform-express';

@ApiTags('Profile')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Controller('profile')
export class ProfileController {
  constructor(private readonly profileService: ProfileService) {}

  @Get('me')
  @ApiOperation({ summary: 'Lấy thông tin cá nhân hiện tại' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Thông tin cá nhân của user.',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'USER_NOT_FOUND',
  })
  async getMe(@Req() req: AuthenticatedRequest) {
    return { data: await this.profileService.getMe(req.user.sub) };
  }

  @Get('onboarding-status')
  @UseGuards(JwtAuthGuard)
  async getOnboardingStatus(@Req() req: AuthenticatedRequest) {
    return this.profileService.getOnboardingStatus(req.user.sub);
  }

  @Patch('onboarding')
  @UseGuards(JwtAuthGuard)
  async updateProgress(
    @Req() req: AuthenticatedRequest,
    @Body() dto: UpdateOnboardingProgressDto,
  ) {
    return this.profileService.updateOnboardingProgress(req.user.sub, dto);
  }

  @Post('onboarding-complete')
  @UseGuards(JwtAuthGuard)
  async completeOnboarding(@Req() req: AuthenticatedRequest) {
    return this.profileService.completeOnboarding(req.user.sub);
  }

  @Patch('me')
  @ApiOperation({ summary: 'Cập nhật profile' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Profile đã được cập nhật.',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'USER_NOT_FOUND',
  })
  async updateProfile(
    @Req() req: AuthenticatedRequest,
    @Body() dto: UpdateProfileDto,
  ) {
    return { data: await this.profileService.updateProfile(req.user.sub, dto) };
  }

  @Post('change-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Đổi mật khẩu' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Mật khẩu đã được đổi.',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'USER_NOT_FOUND',
  })
  async changePassword(
    @Req() req: AuthenticatedRequest,
    @Body() dto: ChangePasswordDto,
  ) {
    return await this.profileService.changePassword(req.user.sub, dto);
  }

  @Post('avatar')
  @ApiOperation({ summary: 'Tải lên ảnh đại diện mới' })
  @UseInterceptors(FileInterceptor('file'))
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Ảnh đại diện đã được cập nhật thành công.',
  })
  async uploadAvatar(
    @Req() req: AuthenticatedRequest,
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: 5 * 1024 * 1024 }), // Giới hạn 5MB
          new FileTypeValidator({ fileType: '.(png|jpeg|jpg|webp)' }), // Chỉ nhận file ảnh
        ],
      }),
    )
    file: Express.Multer.File,
  ) {
    return await this.profileService.uploadAvatar(req.user.sub, file);
  }

  @Get('activity')
  @ApiOperation({ summary: 'Lấy lịch sử hoạt động' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Lịch sử hoạt động của user.',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'USER_NOT_FOUND',
  })
  async getActivity(@Req() req: AuthenticatedRequest) {
    return { data: await this.profileService.getActivity(req.user.sub) };
  }

  @Delete('me')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Xóa vĩnh viễn tài khoản (Hard delete)' })
  @ApiResponse({
    status: HttpStatus.NO_CONTENT,
    description: 'Tài khoản đã được xóa.',
  })
  async deleteAccount(@Req() req: AuthenticatedRequest) {
    return await this.profileService.deleteAccount(req.user.sub);
  }

  @Get('saved-courses')
  @ApiOperation({ summary: 'Lấy danh sách khóa học đã lưu' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Danh sách các khóa học đã lưu của user thành công.',
  })
  async getSavedCourses(@Req() req: AuthenticatedRequest) {
    return { data: await this.profileService.getSavedCourses(req.user.sub) };
  }

  @Get('saved-jobs')
  @ApiOperation({ summary: 'Lấy danh sách công việc đã lưu' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Danh sách các công việc đã lưu của user thành công.',
  })
  async getSavedJobs(@Req() req: AuthenticatedRequest) {
    return { data: await this.profileService.getSavedJobs(req.user.sub) };
  }

  @Post('saved-jobs')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Lưu công việc' })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Lưu công việc thành công.',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'JOB_NOT_FOUND',
  })
  async saveJob(@Req() req: AuthenticatedRequest, @Body() dto: SaveJobDto) {
    return await this.profileService.saveJob(req.user.sub, dto.job_id);
  }

  @Delete('saved-jobs/:jobId')
  @ApiOperation({ summary: 'Hủy lưu công việc' })
  @ApiParam({
    name: 'jobId',
    type: String,
    description: 'ID của công việc cần hủy lưu',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Hủy lưu công việc thành công.',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'SAVED_JOB_NOT_FOUND_OR_ALREADY_DELETED',
  })
  async deleteSavedJob(
    @Req() req: AuthenticatedRequest,
    @Param('jobId') jobId: string,
  ) {
    return await this.profileService.deleteSavedJob(req.user.sub, jobId);
  }

  @Patch('default-cv')
  @ApiOperation({ summary: 'Đặt một CV làm mặc định cho ứng viên' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Cập nhật CV mặc định thành công.',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'CV_NOT_FOUND',
  })
  async setDefaultCv(
    @Req() req: AuthenticatedRequest,
    @Body() dto: SetDefaultCvDto,
  ) {
    return await this.profileService.setDefaultCv(req.user.sub, dto.cv_id);
  }

  @Patch('default-matching')
  @ApiOperation({ summary: 'Đặt một kết quả đối sánh làm mặc định hiển thị' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Cập nhật kết quả đối sánh mặc định thành công.',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'MATCH_RECORD_NOT_FOUND',
  })
  async setDefaultMatching(
    @Req() req: AuthenticatedRequest,
    @Body() dto: SetDefaultMatchingDto,
  ) {
    return await this.profileService.setDefaultMatching(
      req.user.sub,
      dto.match_id,
    );
  }
}
