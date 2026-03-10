import { Suspense, lazy } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router";
import AppLayout from "./layouts/AppLayout";

const Expression = lazy(() => import("./chapters/Expression"));
const Histones = lazy(() => import("./chapters/Histones"));
const Chromatin = lazy(() => import("./chapters/Chromatin"));
const Disease = lazy(() => import("./chapters/Disease"));
const Conservation = lazy(() => import("./chapters/Conservation"));
const Data = lazy(() => import("./chapters/Data"));

export default function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={null}>
        <Routes>
          <Route element={<AppLayout />}>
            <Route index element={<Navigate to="/data" replace />} />
            <Route path="expression" element={<Expression />} />
            <Route path="histones" element={<Histones />} />
            <Route path="chromatin" element={<Chromatin />} />
            <Route path="disease" element={<Disease />} />
            <Route path="conservation" element={<Conservation />} />
            <Route path="data" element={<Data />} />
          </Route>
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
