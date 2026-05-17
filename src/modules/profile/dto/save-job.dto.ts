import { IsNotEmpty, IsString } from 'class-validator';

export class SaveJobDto {
  @IsNotEmpty()
  @IsString()
  job_id: string;
}
