import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString } from 'class-validator';
import { Transform } from 'class-transformer';

export class LoginDto {
  @ApiProperty({ example: 'a@gmail.com' })
  @IsEmail({}, { message: 'Email không đúng định dạng' })
  @IsNotEmpty()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.toLowerCase().trim() : value,
  )
  email: string;

  @ApiProperty({ example: '123456' })
  @IsString()
  @IsNotEmpty()
  password: string;
}

export class LoginResponseDto {
  @ApiProperty()
  user_id: string;

  @ApiProperty()
  email: string | null;

  @ApiProperty()
  access_token: string;

  @ApiProperty()
  refresh_token: string;
}
