import { Role } from '../types/itsm';

/**
 * Abstract Base User demonstrating OOP Encapsulation and Inheritance
 */
export abstract class UserEntity {
  protected readonly _id: string;
  protected _username: string;
  protected _fullName: string;
  protected _email: string;
  protected readonly _role: Role;

  constructor(id: string, username: string, fullName: string, email: string, role: Role) {
    if (!id || !username || !fullName || !email) {
      throw new Error('All user identity attributes (id, username, fullName, email) must be non-empty.');
    }
    this._id = id;
    this._username = username;
    this._fullName = fullName;
    this._email = email;
    this._role = role;
  }

  // Encapsulated Getters
  public get id(): string {
    return this._id;
  }

  public get username(): string {
    return this._username;
  }

  public get fullName(): string {
    return this._fullName;
  }

  public get email(): string {
    return this._email;
  }

  public get role(): Role {
    return this._role;
  }

  // Polymorphic permission checks
  public abstract canAssignTechnician(): boolean;
  public abstract canCloseIncident(): boolean;
  public abstract canVerifyResolution(): boolean;
  public abstract canConfigurePolicies(): boolean;

  public toJSON() {
    return {
      id: this._id,
      username: this._username,
      fullName: this._fullName,
      email: this._email,
      role: this._role,
    };
  }
}

/**
 * Employee Subclass
 */
export class EmployeeUser extends UserEntity {
  private _department: string;

  constructor(id: string, username: string, fullName: string, email: string, department: string) {
    super(id, username, fullName, email, 'ROLE_EMPLOYEE');
    this._department = department;
  }

  public get department(): string {
    return this._department;
  }

  public set department(dept: string) {
    this._department = dept;
  }

  public override canAssignTechnician(): boolean {
    return false; // Employees cannot assign
  }

  public override canCloseIncident(): boolean {
    return false; // Only Admin or verification flow
  }

  public override canVerifyResolution(): boolean {
    return true; // Employees verify their own resolved incidents
  }

  public override canConfigurePolicies(): boolean {
    return false;
  }

  public override toJSON() {
    return {
      ...super.toJSON(),
      department: this._department,
    };
  }
}

/**
 * Technician Subclass
 */
export class TechnicianUser extends UserEntity {
  private _skills: string[];
  private _experienceYears: number;
  private _maxWorkload: number;
  private _available: boolean;
  private _activeIncidentCount: number;
  private _specialization: string;

  constructor(
    id: string,
    username: string,
    fullName: string,
    email: string,
    skills: string[],
    experienceYears: number,
    maxWorkload: number = 6,
    available: boolean = true,
    activeIncidentCount: number = 0,
    specialization: string = 'Systems Technician'
  ) {
    super(id, username, fullName, email, 'ROLE_TECHNICIAN');
    this._skills = [...skills];
    this._experienceYears = experienceYears;
    this._maxWorkload = maxWorkload;
    this._available = available;
    this._activeIncidentCount = activeIncidentCount;
    this._specialization = specialization;
  }

  public get skills(): string[] {
    return [...this._skills];
  }

  public get experienceYears(): number {
    return this._experienceYears;
  }

  public get maxWorkload(): number {
    return this._maxWorkload;
  }

  public get available(): boolean {
    return this._available;
  }

  public get activeIncidentCount(): number {
    return this._activeIncidentCount;
  }

  public get specialization(): string {
    return this._specialization;
  }

  public hasCapacity(): boolean {
    return this._available && this._activeIncidentCount < this._maxWorkload;
  }

  public incrementWorkload(): void {
    this._activeIncidentCount += 1;
  }

  public decrementWorkload(): void {
    if (this._activeIncidentCount > 0) {
      this._activeIncidentCount -= 1;
    }
  }

  public setAvailable(avail: boolean): void {
    this._available = avail;
  }

  public override canAssignTechnician(): boolean {
    return false;
  }

  public override canCloseIncident(): boolean {
    return false;
  }

  public override canVerifyResolution(): boolean {
    return false;
  }

  public override canConfigurePolicies(): boolean {
    return false;
  }

  public override toJSON() {
    return {
      ...super.toJSON(),
      skills: this._skills,
      experienceYears: this._experienceYears,
      maxWorkload: this._maxWorkload,
      available: this._available,
      activeIncidentCount: this._activeIncidentCount,
      specialization: this._specialization,
    };
  }
}

/**
 * Administrator Subclass
 */
export class AdministratorUser extends UserEntity {
  private _managedDivision: string;

  constructor(id: string, username: string, fullName: string, email: string, managedDivision: string) {
    super(id, username, fullName, email, 'ROLE_ADMIN');
    this._managedDivision = managedDivision;
  }

  public get managedDivision(): string {
    return this._managedDivision;
  }

  public override canAssignTechnician(): boolean {
    return true; // Admins can assign & re-assign
  }

  public override canCloseIncident(): boolean {
    return true; // Admins have master override closure authority
  }

  public override canVerifyResolution(): boolean {
    return true;
  }

  public override canConfigurePolicies(): boolean {
    return true;
  }

  public override toJSON() {
    return {
      ...super.toJSON(),
      managedDivision: this._managedDivision,
    };
  }
}
