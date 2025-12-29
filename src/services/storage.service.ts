
import { Injectable } from '@angular/core';
import { Project } from '../models/caption.model';

@Injectable({
  providedIn: 'root',
})
export class StorageService {
  private readonly STORAGE_KEY = 'ai_caption_generator_projects';

  getProjects(): Project[] {
    try {
      const projectsJson = localStorage.getItem(this.STORAGE_KEY);
      if (!projectsJson) return [];
      const projects = JSON.parse(projectsJson) as Project[];
      return projects.sort((a, b) => b.lastModified - a.lastModified);
    } catch (error) {
      console.error('Error loading projects from localStorage', error);
      return [];
    }
  }

  saveProject(project: Project): void {
    try {
      const projects = this.getProjects();
      const existingIndex = projects.findIndex((p) => p.id === project.id);
      if (existingIndex > -1) {
        projects[existingIndex] = project;
      } else {
        projects.push(project);
      }
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(projects));
    } catch (error) {
      console.error('Error saving project to localStorage', error);
    }
  }

  getProject(projectId: string): Project | null {
    try {
      const projects = this.getProjects();
      return projects.find((p) => p.id === projectId) || null;
    } catch (error)      {
        console.error('Error getting project from localStorage', error);
        return null;
    }
  }
}
