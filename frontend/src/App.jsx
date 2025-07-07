import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Login from './pages/Login';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Login />} />
        {/* More routes like dashboard can go here later */}
      </Routes>
    </Router>
  );
}

export default App;
