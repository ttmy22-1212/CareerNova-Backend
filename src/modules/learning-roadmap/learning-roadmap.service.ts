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

      const recommendedFromDB = await this.prisma.course.findMany({
        where: { is_recommended: true },
      });

      let recommended_courses: CourseItemDto[] = recommendedFromDB.map(
        (course) => {
          let learnersNum = 45000;
          if (course.total_learners?.includes('K')) {
            learnersNum =
              parseFloat(course.total_learners.replace('K', '')) * 1000;
          } else if (!isNaN(Number(course.total_learners))) {
            learnersNum = Number(course.total_learners);
          }

          const isSaved = savedCourseIds.has(course.course_id);

          return {
            id: course.course_id,
            title: course.course_title,
            provider: course.provider_name,
            duration: `${course.duration_hours}h`,
            level: 'Intermediate',
            rating: course.rating ? course.rating.toNumber() : 4.5,
            learners: learnersNum,
            progress: isSaved ? 100 : 0,
            is_saved: isSaved,
            skills: course.skills_tags || [],
            price: course.price ? course.price.toNumber() : 0,
            image: course.thumbnail_icon === 'triangle' ? '📘' : '▲',
            source_url: course.source_url || undefined,
          };
        },
      );

      if (!filters.skill) {
        learning_paths = learning_paths.slice(0, 6);
        recommended_courses = recommended_courses.slice(0, 6);
      }

      return { learning_paths, recommended_courses };
    } catch (error: unknown) {
      this.logger.error(`Error in getRoadmap: ${(error as Error).message}`);
      throw new BadRequestException('Không thể tải dữ liệu lộ trình học tập');
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
}
