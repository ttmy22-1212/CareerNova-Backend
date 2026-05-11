import { IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ChangePasswordDto {
  @ApiProperty()
  @IsString()
  @MinLength(6)
  current_password: string;

  @ApiProperty()
  @IsString()
  @MinLength(6)
  new_password: string;
}
