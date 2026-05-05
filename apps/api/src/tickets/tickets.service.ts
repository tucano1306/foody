import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Ticket } from './ticket.entity';
import { TicketItem } from './ticket-item.entity';
import { ParseTicketDto } from './dto/parse-ticket.dto';
import { SaveTicketDto } from './dto/save-ticket.dto';

// ─── OCR line patterns (kept simple — real OCR happens client-side) ──────────
const PRICE_RE = /\b(\d{1,4}[.,]\d{2})\b/;
const SKIP_RE = /^(TOTAL|SUBTOTAL|TAX|CHANGE|THANK|STORE|CASHIER|DATE|TIME|\*+|=+|-+|#)/i;

function normalizeName(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replaceAll(/[^a-z0-9 ]/g, ' ')
    .replaceAll(/\s+/g, ' ')
    .trim();
}

function parsePrice(s: string): number | null {
  const m = PRICE_RE.exec(s);
  if (!m) return null;
  return Number.parseFloat(m[1].replace(',', '.'));
}

export interface ParsedItem {
  name: string;
  price: number | null;
}

export interface ParsedReceipt {
  items: ParsedItem[];
  total: number | null;
}

@Injectable()
export class TicketsService {
  constructor(
    @InjectRepository(Ticket)
    private readonly ticketRepo: Repository<Ticket>,
    @InjectRepository(TicketItem)
    private readonly itemRepo: Repository<TicketItem>,
  ) {}

  parse(dto: ParseTicketDto): ParsedReceipt {
    const lines = dto.rawText.split('\n').map((l) => l.trim()).filter(Boolean);
    const items: ParsedItem[] = [];
    let total: number | null = null;

    for (const line of lines) {
      if (SKIP_RE.test(line)) continue;

      const price = parsePrice(line);
      const name = line.replaceAll(PRICE_RE, '').trim();

      if (!name || name.length < 2) continue;

      items.push({ name, price });
    }

    // Last numeric match that looks like a total
    const totalLine = lines.findLast((l) =>
      /total/i.test(l) && PRICE_RE.test(l),
    );
    if (totalLine) total = parsePrice(totalLine);

    return { items, total };
  }

  async save(userId: string, dto: SaveTicketDto): Promise<Ticket> {
    const ticket = this.ticketRepo.create({
      userId,
      rawText: dto.rawText ?? null,
      total: dto.total ?? null,
      storeName: dto.storeName ?? null,
      receiptDate: dto.receiptDate ?? null,
      items: dto.items.map((i) =>
        this.itemRepo.create({
          productName: i.productName,
          normalizedName: i.normalizedName ?? normalizeName(i.productName),
          price: i.price ?? null,
          quantity: i.quantity ?? 1,
        }),
      ),
    });

    return this.ticketRepo.save(ticket);
  }

  findAll(userId: string): Promise<Ticket[]> {
    return this.ticketRepo.find({
      where: { userId },
      order: { createdAt: 'DESC' },
      take: 50,
    });
  }
}
