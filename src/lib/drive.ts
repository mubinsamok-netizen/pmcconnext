import { drive, DRIVE_ROOT_FOLDER_ID } from "./google";
import { Readable } from "stream";

export async function createFolder(folderName: string, parentId: string = DRIVE_ROOT_FOLDER_ID) {
  try {
    const fileMetadata = {
      name: folderName,
      mimeType: "application/vnd.google-apps.folder",
      parents: [parentId],
    };

    const file = await drive.files.create({
      requestBody: fileMetadata,
      fields: "id, name, webViewLink",
    });

    return file.data;
  } catch (error) {
    console.error(`Error creating folder ${folderName}:`, error);
    throw error;
  }
}

export async function findOrCreateFolder(folderName: string, parentId: string = DRIVE_ROOT_FOLDER_ID) {
  try {
    const query = `name = '${folderName}' and '${parentId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
    
    const response = await drive.files.list({
      q: query,
      fields: "files(id, name, webViewLink)",
      spaces: "drive",
    });

    if (response.data.files && response.data.files.length > 0) {
      return response.data.files[0];
    } else {
      return await createFolder(folderName, parentId);
    }
  } catch (error) {
    console.error(`Error finding/creating folder ${folderName}:`, error);
    throw error;
  }
}

export async function uploadFile(
  fileName: string,
  mimeType: string,
  buffer: Buffer,
  parentId: string
) {
  try {
    const stream = new Readable();
    stream.push(buffer);
    stream.push(null);

    const fileMetadata = {
      name: fileName,
      parents: [parentId],
    };

    const media = {
      mimeType,
      body: stream,
    };

    const file = await drive.files.create({
      requestBody: fileMetadata,
      media: media,
      fields: "id, name, webViewLink, webContentLink",
    });

    return file.data;
  } catch (error) {
    console.error(`Error uploading file ${fileName}:`, error);
    throw error;
  }
}

export async function setupProjectFolders(projectName: string) {
  const projectFolder = await findOrCreateFolder(projectName);
  if (!projectFolder.id) throw new Error("Failed to create project folder");

  const subfolders = [
    "Drawings",
    "Photos",
    "Contracts",
    "Daily Reports",
    "BOQ & Budget"
  ];

  const createdFolders: Record<string, string> = {
    root: projectFolder.id
  };

  for (const sub of subfolders) {
    const subfolder = await findOrCreateFolder(sub, projectFolder.id);
    if (subfolder.id) {
      createdFolders[sub] = subfolder.id;
    }
  }

  return createdFolders;
}
