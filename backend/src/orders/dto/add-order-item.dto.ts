import {
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  ValidateIf,
} from 'class-validator';

export class AddOrderItemDto {
  @IsUUID()
  @IsOptional()
  productId?: string;

  @ValidateIf((dto) => !dto.productId)
  @IsString()
  productNameSnapshot?: string;

  @ValidateIf((dto) => !dto.productId)
  @IsString()
  unitType?: string;

  // Not IsInt: weight units are fractional. Two decimal places matches the
  // column, and IsPositive still rejects zero and negatives.
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  quantity: number;
}
