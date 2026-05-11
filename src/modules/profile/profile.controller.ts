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
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiResponse,
} from '@nestjs/swagger';
import { ProfileService } from './profile.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { ChangePasswordDto } from './dto/change-profile.dto';
import type { AuthenticatedRequest } from '../auth/interfaces/auth.interface';

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
}
