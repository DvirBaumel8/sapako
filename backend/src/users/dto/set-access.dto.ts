import { IsBoolean } from 'class-validator';

export class SetAccessDto {
  @IsBoolean()
  granted: boolean;
}
