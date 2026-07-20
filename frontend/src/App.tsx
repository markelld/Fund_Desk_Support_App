import { BrowserRouter, Route, Routes } from "react-router-dom";
import FundOverview from "./pages/FundOverview";
import TraderLookup from "./pages/TraderLookup";
import TraderDetail from "./pages/TraderDetail";
import OrderLifecycle from "./pages/OrderLifecycle";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<FundOverview />} />
        <Route path="/traders" element={<TraderLookup />} />
        <Route path="/traders/:traderId" element={<TraderDetail />} />
        <Route path="/orders/:orderId" element={<OrderLifecycle />} />
      </Routes>
    </BrowserRouter>
  );
}
