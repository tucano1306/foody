import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './user.entity';
import { UpdateUserDto } from './dto/update-user.dto';

export interface FindOrCreateInput {
  id: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
}

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepo: Repository<User>,
  ) {}

  async findOrCreate(input: FindOrCreateInput): Promise<User> {
    const existing = await this.usersRepo.findOne({ where: { id: input.id } });
    if (existing) return existing;

    // Two first requests can race (e.g. /products and /payments on first load).
    // Insert with ignore-on-conflict, then read the row.
    await this.usersRepo
      .createQueryBuilder()
      .insert()
      .into(User)
      .values({
        id: input.id,
        email: input.email,
        name: input.name,
        avatarUrl: input.avatarUrl,
      })
      .orIgnore()
      .execute();

    return this.usersRepo.findOneOrFail({ where: { id: input.id } });
  }

  async findById(id: string): Promise<User | null> {
    return this.usersRepo.findOne({ where: { id } });
  }

  async update(id: string, dto: UpdateUserDto): Promise<User> {
    await this.usersRepo.update(id, dto);
    return this.usersRepo.findOneOrFail({ where: { id } });
  }
}
