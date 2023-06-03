import { S3Client, ListObjectsCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { awsRegion, awsBucketName } from './config'
import { foldersFileType, validFiles } from "./getFiltes";
import path from "path";

const s3 = new S3Client({ region: awsRegion });


export const downloadS3File = async (fileToSearch: string) => {
  let file = fileToSearch
  file = file.replace(/\/+/g, "/")
  if (file[0] === "/") {
    file = file.slice(1);
  }

  try {
    const command = new GetObjectCommand({
      Bucket: awsBucketName,
      Key: file,
    });
    const response = await s3.send(command);
    return response;
  } catch (e) {
    return null
  }
}

export const listBucketObjects = async (folderToSearch: string): Promise<foldersFileType> => {
  let folder = folderToSearch
  folder = folder.replace(/\/+/g, "/")
  if (folder[0] === "/") {
    folder = folder.slice(1);
  }
  if (!folder.endsWith("/") && folder !== "") {
    folder = folder + "/";
  }


  let isTruncated = true;
  let nextMarker: string | undefined;
  const allFiles: any[] = [];
  const allFolders: any[] = [];

  while (isTruncated) {
    const command = new ListObjectsCommand({
      Bucket: awsBucketName,
      Prefix: folder,
      Marker: nextMarker,
      Delimiter: "/"
    });
    const response = await s3.send(command);

    if (response.Contents) {
      allFiles.push(...response.Contents);
    }

    if (response.CommonPrefixes) {
      allFolders.push(...response.CommonPrefixes);
    }

    isTruncated = response.IsTruncated;
    nextMarker = response.NextMarker;
  }

  return {
    folders: allFolders.map(f => f.Prefix.slice(0, -1).split('/').pop()),
    files: allFiles
      .filter(f => validFiles.includes(path.extname(f.Key)))
      .map((f) => {
        return {
          fileSize: Math.floor(f.Size / 1024 / 1024 * 100) / 100,
          name: f.Key.split('/').pop(),
        }
      }),
  };
}

