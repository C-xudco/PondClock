import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import "./index.css";
import "./styles/appearance.css";
import "./styles/inkwash.css";

if (window.pondDesktop) document.documentElement.classList.add('desktop-widget');

ReactDOM.createRoot(document.getElementById("root")).render(
    <App />
);
