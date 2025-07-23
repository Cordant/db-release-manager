import {exec} from 'node:child_process';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';

export interface FileAndContent {
  path: string;
  fileContent: string;
}

export class FileUtils {

  static async exists(path: string): Promise<boolean> {
    return await fs.access(path, fs.constants.R_OK).then(() => true).catch(() => false);
  }

  static async readFile(path: string): Promise<string> {
    return await fs.readFile(path).then(data => data.toString());
  }

  static async openFileInFileEditor(fileName: string): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      try {
        const cp = exec(`"${fileName}"`, (error) => {
          if (error) {
            reject(`exec error: ${error}`);
            return;
          }
          cp.kill();
          resolve();
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  static async openFolderInExplorer(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      try {
        const cp = exec(`start .`, (error) => {
          if (error) {
            reject(`exec error: ${error}`);
            return;
          }
          cp.kill();
          resolve();
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  static async getHash(path: string) {
    const exists = await FileUtils.exists(path);
    if (!exists) {
      throw new Error('File does not exist');
    }

    // Is file type and not a directory
    const stat = await fs.stat(path);
    if (!stat.isFile()) {
      throw new Error('File does not exist');
    }

    const buffer = await fs.readFile(path);
    const data = buffer.toString();
    const hash = crypto.createHash('sha512');
    hash.update(data);
    return hash.digest('hex');
  }

  static async createDirectories(path: string) {
    await fs.mkdir(path, {recursive: true});
  }

  static async createBlankVersionJsonFile(path: string) {
    const versionJson = {
      databaseToUse: '${config:stage}_${config:client}',
      fileList: [],
      removedFiles: [],
    };
    await fs.writeFile(path, JSON.stringify([versionJson], null, 2));
  }
}
