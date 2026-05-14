import { IsNotEmpty, IsString } from 'class-validator';

export class RefreshTokenDto {
  @IsString()
  @IsNotEmpty()
  refresh_token: string;
}

export class RefreshTokenResponseDto {
  access_token: string;
  refresh_token: string;
}
