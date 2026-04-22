import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { UsersService } from '../users/users.service';

export interface JwtPayload {
  sub: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
  iat: number;
  exp: number;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private readonly usersService: UsersService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('jwt.secret')!,
      issuer: 'foody-web-auth',
      audience: 'foody-api',
    });
  }

  async validate(payload: JwtPayload) {
    // Lazily create the user on first API call after login
    const user = await this.usersService.findOrCreate({
      id: payload.sub,
      email: payload.email,
      name: payload.name ?? null,
      avatarUrl: payload.avatarUrl ?? null,
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    return user;
  }
}
