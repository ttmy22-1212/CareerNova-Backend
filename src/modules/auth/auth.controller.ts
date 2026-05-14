import {
  Body,
  Controller,
  Post,
  HttpStatus,
  Get,
  Query,
  HttpCode,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { RegisterDto, RegisterResponseDto } from './dto/register.dto';
import { IBaseResponse } from '../../common/interfaces/response.interface';
import { LoginDto, LoginResponseDto } from './dto/login.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @ApiOperation({
    summary: 'Đăng ký tài khoản local',
    description:
      'Tạo tài khoản mới với email và password. Trả về thông tin user cùng access/refresh token.',
  })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Đăng ký thành công.',
    type: RegisterResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    description: 'AUTH_EMAIL_EXISTS',
  })
  @ApiResponse({
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    description: 'VALIDATION_FAILED',
  })
  async register(
    @Body() registerDto: RegisterDto,
  ): Promise<IBaseResponse<RegisterResponseDto>> {
    return this.authService.register(registerDto);
  }

  @Get('verify-email')
  @ApiOperation({ summary: 'Xác thực email' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Xác thực email thành công',
  })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    description: 'AUTH_INVALID_VERIFY_TOKEN',
  })
  async verifyEmail(@Query('token') token: string) {
    return this.authService.verifyEmail(token);
  }

  @Post('login')
  @ApiOperation({ summary: 'Đăng nhập' })
  @ApiResponse({
    status: 200,
    type: LoginResponseDto,
  })
  @ApiResponse({ status: 401, description: 'AUTH_INVALID_CREDENTIALS' })
  @ApiResponse({ status: 404, description: 'AUTH_ACCOUNT_NOT_FOUND' })
  async login(@Body() dto: LoginDto): Promise<IBaseResponse<LoginResponseDto>> {
    return this.authService.login(dto);
  }

  @Get('google')
  googleLogin() {
    return this.authService.getGoogleAuthUrl();
  }

  // callback from Google
  @Get('google/callback')
  async googleCallback(@Query('code') code: string) {
    return this.authService.googleLogin(code);
  }

  // @Get('facebook')
  // facebookLogin() {
  //   return this.authService.getFacebookAuthUrl();
  // }

  // @Get('facebook/callback')
  // async facebookCallback(@Query('code') code: string) {
  //   return this.authService.facebookLogin(code);
  // }

  @Post('forgot-password')
  @ApiOperation({ summary: 'Yêu cầu đặt lại mật khẩu' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Yêu cầu đặt lại mật khẩu thành công (nếu email tồn tại)',
  })
  @ApiResponse({
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    description: 'VALIDATION_FAILED',
  })
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto);
  }

  @Post('reset-password')
  @ApiOperation({ summary: 'Đặt lại mật khẩu mới' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Đặt lại mật khẩu thành công',
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'AUTH_INVALID_RESET_TOKEN',
  })
  @ApiResponse({
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    description: 'VALIDATION_FAILED',
  })
  async resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refreshToken(@Body() dto: RefreshTokenDto) {
    return this.authService.refreshToken(dto.refresh_token);
  }
}
