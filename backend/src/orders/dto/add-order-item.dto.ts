import {
  IsInt,
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

  @IsInt()
  @IsPositive()
  quantity: number;
}
