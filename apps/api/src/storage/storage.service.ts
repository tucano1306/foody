import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class StorageService {
  private readonly s3: S3Client;
  private readonly bucket: string;
  private readonly logger = new Logger(StorageService.name);

  constructor(private readonly config: ConfigService) {
    this.s3 = new S3Client({
      region: config.get<string>('aws.region') ?? 'us-east-1',
      credentials: {
        accessKeyId: config.get<string>('aws.accessKeyId') ?? '',
        secretAccessKey: config.get<string>('aws.secretAccessKey') ?? '',
      },
    });
    this.bucket = config.get<string>('aws.s3Bucket') ?? 'foody-product-photos';
  }

  /**
   * Generates a presigned PUT URL so the client can upload directly to S3.
   * Returns the upload URL and the final public file URL.
   */
  async getPresignedUploadUrl(
    originalFileName: string,
    contentType: string,
  ): Promise<{ uploadUrl: string; fileUrl: string; key: string }> {
    const ext = originalFileName.split('.').pop() ?? 'jpg';
    const key = `products/${uuidv4()}.${ext}`;

    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: contentType,
    });

    const uploadUrl = await getSignedUrl(this.s3, command, { expiresIn: 300 });
    const region = this.config.get<string>('aws.region') ?? 'us-east-1';
    const fileUrl = `https://${this.bucket}.s3.${region}.amazonaws.com/${key}`;

    return { uploadUrl, fileUrl, key };
  }

  async deleteFile(key: string): Promise<void> {
    try {
      await this.s3.send(
        new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
      );
    } catch (err) {
      this.logger.error(`Failed to delete S3 object: ${key}`, err);
    }
  }
}
