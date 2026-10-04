import { IsDefined, IsString, MaxLength, ValidateIf } from 'class-validator';

export class UpdateProductNoteDto {
  // Required, but nullable: null clears the note. A missing field is a 400
  // rather than a silent no-op, so a client bug can't look like a save.
  @IsDefined()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(200)
  note: string | null;
}
