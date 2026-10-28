-- Hybrid question pool: link table for central questions an exam "selected" via upload (no copy)
CREATE TABLE IF NOT EXISTS exam_source_questions (
  id VARCHAR(191) NOT NULL,
  exam_id VARCHAR(191) NOT NULL,
  question_id VARCHAR(191) NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY exam_source_questions_exam_id_question_id_key (exam_id, question_id),
  KEY exam_source_questions_exam_id_idx (exam_id),
  KEY exam_source_questions_question_id_idx (question_id),
  CONSTRAINT exam_source_questions_exam_id_fkey FOREIGN KEY (exam_id) REFERENCES exams(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT exam_source_questions_question_id_fkey FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
