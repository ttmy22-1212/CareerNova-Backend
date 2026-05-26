import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty } from 'class-validator';

export class SetDefaultCvDto {
  @ApiProperty({
    description: 'ID của CV cần đặt làm mặc định',
    example: 'cv_uuid_12345',
  })
  @IsString()
  @IsNotEmpty()
  cv_id: string;
}

export class SetDefaultMatchingDto {
  @ApiProperty({
    description: 'ID của kết quả đối sánh cần đặt làm mặc định',
    example: 'match_uuid_67890',
  })
  @IsString()
  @IsNotEmpty()
  match_id: string;
}
