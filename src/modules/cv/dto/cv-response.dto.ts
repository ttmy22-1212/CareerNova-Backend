import { ApiProperty } from '@nestjs/swagger';

export class CvUploadResponseDto {
  @ApiProperty({ example: '9001' })
  cv_id: string;

  @ApiProperty({ example: 'mycv.pdf' })
  file_name: string;

  @ApiProperty({ example: 'https://storage.cloudinary.com/...' })
  file_url: string;

  @ApiProperty()
  uploaded_at: Date;
}
