import {
  Chart as ChartJS,
  LineController,
  LineElement,
  LinearScale,
  PointElement,
  TimeScale,
  Tooltip,
} from "chart.js";
import "chartjs-adapter-date-fns";

ChartJS.register(LineController, LineElement, PointElement, LinearScale, TimeScale, Tooltip);
