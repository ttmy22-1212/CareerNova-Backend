import {
  Controller,
  Get,
  UseGuards,
  Req,
  Query,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiResponse,
} from '@nestjs/swagger';
import { DashboardService } from './dashboard.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard';
import type {
  AuthenticatedRequest,
  OptionalAuthenticatedRequest,
} from '../auth/interfaces/auth.interface';

@ApiTags('Dashboard')
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('market-summary')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({ summary: 'Lấy tóm tắt thị trường (Hybrid)' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Thành công',
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Không có quyền truy cập',
  })
  async getMarketSummary(@Req() req: OptionalAuthenticatedRequest) {
    let userId: string | null = null;
    if (req.user) {
      userId = req.user.sub;
      return { data: await this.dashboardService.getMarketSummary(userId) };
    }
    return { data: await this.dashboardService.getMarketSummary() };
  }

  @Get('personal')
  @ApiBearerAuth('JWT-auth')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Lấy dữ liệu dashboard cá nhân' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Thành công',
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Không có quyền truy cập',
  })
  async getPersonalDashboard(
    @Req() req: AuthenticatedRequest,
    @Query('cv_id') cv_id?: string,
  ) {
    return {
      data: await this.dashboardService.getPersonalDashboard(
        req.user.sub,
        cv_id,
      ),
    };
  }
}
