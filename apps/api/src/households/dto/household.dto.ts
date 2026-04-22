import { IsString, MinLength, MaxLength } from 'class-validator';

export class CreateHouseholdDto {
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name: string;
}

export class JoinHouseholdDto {
  @IsString()
  @MinLength(4)
  @MaxLength(10)
  code: string;
}
