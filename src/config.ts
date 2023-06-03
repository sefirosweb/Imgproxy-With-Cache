import dotenv from "dotenv";
dotenv.config();

export const port = process.env.APP_PORT ?? 8080;
export const appUrl = process.env.APP_URL ?? `http://localhost:${port}`;

export const useS3 = process.env.USE_AWS_S3 === 'true'

if (useS3) {
    if (process.env.AWS_REGION === undefined || !process.env.AWS_REGION) throw Error('MISSING AWS_REGION')
    if (process.env.AWS_BUCKET_NAME === undefined || !process.env.AWS_BUCKET_NAME) throw Error('MISSING AWS_BUCKET_NAME')
    if (process.env.AWS_ACCESS_KEY_ID === undefined || !process.env.AWS_ACCESS_KEY_ID) throw Error('MISSING AWS_ACCESS_KEY_ID')
    if (process.env.AWS_SECRET_ACCESS_KEY === undefined || !process.env.AWS_SECRET_ACCESS_KEY) throw Error('MISSING AWS_SECRET_ACCESS_KEY')
}

export const awsRegion = process.env.AWS_REGION;
export const awsBucketName = process.env.AWS_BUCKET_NAME;
export const awsAccessKeyId = process.env.AWS_ACCESS_KEY_ID;
export const awsSecretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;