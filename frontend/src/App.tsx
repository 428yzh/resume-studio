import { Routes, Route, Navigate } from "react-router-dom";
import Layout from "@web/components/Layout";
import ResumeEditor from "@web/pages/ResumeEditor";
import ResumeList from "@web/pages/ResumeList";
import JDAnalysis from "@web/pages/JDAnalysis";
import SkillLibrary from "@web/pages/SkillLibrary";
import QuizList from "@web/pages/QuizList";
import QuizSession from "@web/pages/QuizSession";
import QuizExam from "@web/pages/QuizExam";
import QuizRecords from "@web/pages/QuizRecords";
import QuizRecordDetail from "@web/pages/QuizRecordDetail";
import MockInterviewList from "@web/pages/MockInterviewList";
import MockInterview from "@web/pages/MockInterview";
import FeynmanRoomList from "@web/pages/FeynmanRoomList";
import FeynmanRoom from "@web/pages/FeynmanRoom";

export default function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Navigate to="/resumes" replace />} />
        <Route path="/resumes" element={<ResumeList />} />
        <Route path="/resumes/:id" element={<ResumeEditor />} />
        <Route path="/jd" element={<JDAnalysis />} />
        <Route path="/skills" element={<SkillLibrary />} />
        <Route path="/mock-interview" element={<MockInterviewList />} />
        <Route path="/mock-interview/:id" element={<MockInterview />} />
        <Route path="/quiz" element={<QuizList />} />
        <Route path="/quiz/session/:id" element={<QuizSession />} />
        <Route path="/quiz/exam/:id" element={<QuizExam />} />
        <Route path="/quiz/records" element={<QuizRecords />} />
        <Route path="/quiz/records/:id" element={<QuizRecordDetail />} />
        <Route path="/feynman" element={<FeynmanRoomList />} />
        <Route path="/feynman/new" element={<FeynmanRoomList />} />
        <Route path="/feynman/:id" element={<FeynmanRoom />} />
      </Routes>
    </Layout>
  );
}
