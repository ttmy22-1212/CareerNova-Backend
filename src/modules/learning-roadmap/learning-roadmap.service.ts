import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  LearningRoadmapFilterDto,
  LearningRoadmapResponseDto,
  CourseItemDto,
  LearningPathDto,
} from './dto/learning-roadmap.dto';

@Injectable()
export class LearningRoadmapService {
  private readonly logger = new Logger(LearningRoadmapService.name);

  // Mảng màu sắc cố định dùng cho UI giao diện
  private readonly gradients = [
    'from-violet-500 to-purple-600',
    'from-blue-500 to-cyan-600',
    'from-orange-500 to-red-600',
    'from-emerald-500 to-teal-600',
  ];

  constructor(private readonly prisma: PrismaService) {}

  async getRoadmap(
    filters: LearningRoadmapFilterDto,
    userId: string,
  ): Promise<LearningRoadmapResponseDto> {
    try {
      this.logger.log(
        `Fetching learning roadmap for user: ${userId} with filters: ${JSON.stringify(filters)}`,
      );

      const userSaved = await this.prisma.savedCourse.findMany({
        where: { user_id: userId, status: 'saved' },
        select: { course_id: true },
      });
      const savedCourseIds = new Set(userSaved.map((sc) => sc.course_id));
      const normalizedLimit = this.normalizeLimit(filters.limit, 6, 50);

      const pathsFromDB = await this.prisma.learningPath.findMany({
        where: filters.skill
          ? {
              skill_key: {
                contains: filters.skill,
                mode: 'insensitive',
              },
            }
          : {},
        include: {
          courses_in_path: {
            orderBy: { sort_order: 'asc' },
            include: { course: true },
          },
        },
      });

      let learning_paths: LearningPathDto[] = pathsFromDB.map(
        (path, index) => ({
          id: path.path_id,
          title: path.path_title,
          description: path.path_description,
          duration: path.estimated_duration_months,
          progress: 0,
          difficulty: path.path_level,
          icon: this.getPathIcon(path.path_icon),
          color: this.gradients[index % this.gradients.length],
          skill_key: path.skill_key,
          courses: path.courses_in_path.map((pc) => {
            const c = pc.course;
            const isSaved = savedCourseIds.has(c.course_id);
            return {
              id: c.course_id,
              title: c.course_title,
              provider: c.provider_name,
              duration: `${c.duration_hours}h`,
              level: 'Intermediate',
              rating: c.rating ? c.rating.toNumber() : 4.5,
              learners: 85000,
              progress: isSaved ? 100 : 0,
              is_saved: isSaved,
              skills: c.skills_tags || [],
              price: c.price ? c.price.toNumber() : 0,
              image: c.provider_name === 'Coursera' ? '⚛️' : '🟢',
              source_url: c.source_url || undefined,
            };
          }),
        }),
      );

      const recommended_courses = await this.getRecommendedCourses(
        {
          skill: filters.skill,
          level: filters.level,
          limit: filters.limit,
        },
        userId,
      );

      if (!filters.skill) {
        learning_paths = learning_paths.slice(0, normalizedLimit);
      }

      return { learning_paths, recommended_courses };
    } catch (error: unknown) {
      this.logger.error(`Error in getRoadmap: ${(error as Error).message}`);
      throw new BadRequestException('Không thể tải dữ liệu lộ trình học tập');
    }
  }

  async getRecommendedCourses(
    filters: LearningRoadmapFilterDto,
    userId: string,
  ): Promise<CourseItemDto[]> {
    try {
      this.logger.log(
        `Fetching recommended courses for user: ${userId} with filters: ${JSON.stringify(filters)}`,
      );

      const normalizedLimit = this.normalizeLimit(filters.limit, 6, 24);
      const userSaved = await this.prisma.savedCourse.findMany({
        where: { user_id: userId, status: 'saved' },
        select: { course_id: true },
      });
      const savedCourseIds = new Set(userSaved.map((sc) => sc.course_id));

      const recommendedFromDB = await this.prisma.course.findMany({
        where: {
          is_recommended: true,
          ...(filters.skill
            ? {
                OR: [
                  {
                    course_title: {
                      contains: filters.skill,
                      mode: 'insensitive',
                    },
                  },
                  {
                    provider_name: {
                      contains: filters.skill,
                      mode: 'insensitive',
                    },
                  },
                  {
                    skills_tags: {
                      has: filters.skill,
                    },
                  },
                ],
              }
            : {}),
        },
        take: 50,
      });

      let recommendedCourses = recommendedFromDB.map((course) =>
        this.mapCourseItem(course, savedCourseIds),
      );

      if (filters.level && filters.level !== 'All') {
        recommendedCourses = recommendedCourses.filter(
          (course) => course.level === filters.level,
        );
      }

      return recommendedCourses.slice(0, normalizedLimit);
    } catch (error: unknown) {
      this.logger.error(
        `Error in getRecommendedCourses: ${(error as Error).message}`,
      );
      throw new BadRequestException('Không thể tải danh sách khóa học gợi ý');
    }
  }

  async toggleSaveCourse(
    courseId: string,
    userId: string,
  ): Promise<{ message: string; is_saved: boolean }> {
    try {
      this.logger.log(
        `User ${userId} toggling save status for course ${courseId}`,
      );

      // Kiểm tra xem khóa học có tồn tại không
      const courseExists = await this.prisma.course.findUnique({
        where: { course_id: courseId },
      });
      if (!courseExists) {
        throw new BadRequestException('Khóa học không tồn tại');
      }

      // Tìm kiếm bản ghi lưu cũ
      const existingSave = await this.prisma.savedCourse.findUnique({
        where: {
          user_id_course_id: {
            user_id: userId,
            course_id: courseId,
          },
        },
      });

      if (existingSave) {
        // Nếu đã lưu rồi -> Tiến hành xóa (Hủy lưu)
        await this.prisma.savedCourse.delete({
          where: {
            user_id_course_id: {
              user_id: userId,
              course_id: courseId,
            },
          },
        });
        return { message: 'Đã bỏ lưu khóa học thành công', is_saved: false };
      } else {
        // Nếu chưa lưu -> Tiến hành tạo mới bản ghi lưu
        await this.prisma.savedCourse.create({
          data: {
            user_id: userId,
            course_id: courseId,
            status: 'saved',
          },
        });
        return { message: 'Đã lưu khóa học thành công', is_saved: true };
      }
    } catch (error: unknown) {
      this.logger.error(
        `Error in toggleSaveCourse: ${(error as Error).message}`,
      );
      throw new BadRequestException('Thao tác lưu khóa học thất bại');
    }
  }

  private getPathIcon(iconText: string | null): string {
    switch (iconText?.toLowerCase()) {
      case 'rocket':
        return '🚀';
      case 'brain':
        return '🧠';
      case 'laptop':
        return '💻';
      case 'database':
        return '🗄️';
      default:
        return '📊';
    }
  }

  private mapCourseItem(
    course: {
      course_id: string;
      course_title: string;
      provider_name: string;
      duration_hours: number;
      rating: { toNumber(): number } | null;
      total_learners: string | null;
      price: { toNumber(): number } | null;
      skills_tags: string[];
      thumbnail_icon: string | null;
      source_url: string | null;
    },
    savedCourseIds: Set<string>,
  ): CourseItemDto {
    const isSaved = savedCourseIds.has(course.course_id);

    return {
      id: course.course_id,
      title: course.course_title,
      provider: course.provider_name,
      duration: `${course.duration_hours}h`,
      level: 'Intermediate',
      rating: course.rating ? course.rating.toNumber() : 4.5,
      learners: this.parseLearners(course.total_learners),
      progress: isSaved ? 100 : 0,
      is_saved: isSaved,
      skills: course.skills_tags || [],
      price: course.price ? course.price.toNumber() : 0,
      image: course.thumbnail_icon === 'triangle' ? '📘' : '▲',
      source_url: course.source_url || undefined,
    };
  }

  private parseLearners(totalLearners: string | null): number {
    if (totalLearners?.includes('K')) {
      return parseFloat(totalLearners.replace('K', '')) * 1000;
    }

    if (!isNaN(Number(totalLearners))) {
      return Number(totalLearners);
    }

    return 45000;
  }

  private normalizeLimit(
    value: string | number | undefined,
    fallback: number,
    max: number,
  ) {
    const parsedValue = Number(value);
    const safeValue = Number.isFinite(parsedValue) ? parsedValue : fallback;

    return Math.min(Math.max(Math.trunc(safeValue), 1), max);
  }
}
