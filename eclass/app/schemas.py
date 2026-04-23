from pydantic import BaseModel


class LoginRequest(BaseModel):
    student_id: str
    password: str


class LoginResponse(BaseModel):
    success: bool
    message: str
    student_id: str | None = None


class AuthStatus(BaseModel):
    is_logged_in: bool
    student_id: str | None = None
    last_login: str | None = None


class VerifyEmailRequest(BaseModel):
    code: str


class CourseResponse(BaseModel):
    course_id: str
    course_name: str
    professor: str
    attendance_rate: float | None = None


class LectureResponse(BaseModel):
    id: str
    week: int
    session: int
    title: str
    duration_min: int | None = None
    attendance: str
    deadline: str | None = None


class AttendRequest(BaseModel):
    course_id: str
    lecture_id: str


class AutomationStatusResponse(BaseModel):
    state: str
    current_course: str | None = None
    current_lecture: str | None = None
    progress: int
    message: str


class AutoModeConfigRequest(BaseModel):
    enabled: bool
    schedule_cron: str | None = None
    target_courses: list[str]


class AutoModeConfigResponse(BaseModel):
    id: int
    enabled: bool
    schedule_cron: str | None = None
    target_courses: list[str]
    created_at: str
    updated_at: str
