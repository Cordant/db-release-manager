import { Injectable } from '@angular/core';
import { LocalhostService } from './localhost.service';
import { DatabaseObject, DatabaseTableForSave } from 'app/models/database-file.model';

@Injectable({
  providedIn: 'root'
})
export class DatabaseService {
  constructor(private localhostService: LocalhostService) { }

  async getDatabase(name: string): Promise<DatabaseObject> {
    return await this.localhostService.get(`databases/${name}`);
  }

  async refreshDatabase(name: string): Promise<DatabaseObject> {
    return await this.localhostService.get(`databases/${name}/refresh`);
  }

  async createDatabaseTable(params: { name: string, details: DatabaseTableForSave }): Promise<DatabaseObject> {
    return await this.localhostService.post(`databases/${params.name}/create-table`, params.details);
  }

  async createDatabaseFunctions(name: string): Promise<DatabaseObject> {
    return await this.localhostService.get(`databases/${name}/create-functions`);
  }

  async initializeDatabase(name: string): Promise<DatabaseObject> {
    return await this.localhostService.get(`databases/${name}/init`);
  }

  async installDatabase(params: { name: string, version: string, environment: string }): Promise<DatabaseObject> {
    return await this.localhostService.get(`databases/${params.name}/install/${params.version}/${params.environment}`);
  }

  async addTemplate(params: { name: string, template: string }): Promise<DatabaseObject> {
    return await this.localhostService.post(`databases/${params.name}/add-template`, { template: params.template });
  }
  async createVersion(name: string): Promise<DatabaseObject> {
    return await this.localhostService.post(`databases/${name}/create-version`);
  }
  async checkParameters(params: { name: string, environment: string }): Promise<DatabaseObject> {
    return await this.localhostService.get(`databases/${params.name}/check-parameters/${params.environment}`);
  }
  async checkCode(params: { name: string, environment: string }): Promise<DatabaseObject> {
    return await this.localhostService.get(`databases/${params.name}/check-code`);
  }
}
