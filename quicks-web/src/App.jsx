import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import data from './data.json';

const FactCard = ({ fact }) => {
  return (
    <div className="fact-card">
      {fact.image_url ? (
        <img src={fact.image_url} alt={fact.hook} className="background-image" />
      ) : (
        <div className="background-image" style={{ background: 'linear-gradient(45deg, #1e1b4b, #312e81)' }} />
      )}
      
      <div className="content-overlay">
        <motion.div 
          initial={{ opacity: 0, x: -20 }}
          whileInView={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.6 }}
        >
          <span className="category-badge">{fact.category}</span>
          <h1 className="hook-text">{fact.hook}</h1>
          <p className="insight-text">{fact.insight}</p>
          
          <div className="twist-container">
            <span className="twist-label">The Twist</span>
            <p className="twist-text">{fact.twist}</p>
          </div>
        </motion.div>
      </div>
    </div>
  );
};

function App() {
  const [facts, setFacts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchFacts = async () => {
      try {
        const apiBase = import.meta.env.VITE_API_BASE_URL ?? '';
        const response = await fetch(`${apiBase}/api/facts`);
        if (!response.ok) throw new Error(`API responded ${response.status}`);
        const apiFacts = await response.json();
        setFacts(Array.isArray(apiFacts) ? apiFacts : []);
      } catch (error) {
        console.error("Error fetching facts:", error);
        // Fallback to bundled sample data so UI still runs.
        setFacts(Array.isArray(data) ? data : []);
      } finally {
        setLoading(false);
      }
    };
    fetchFacts();
  }, []);

  if (loading) {
    return (
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#000', color: '#fff' }}>
        <h2 style={{ fontFamily: 'Outfit' }}>Loading Facts...</h2>
      </div>
    );
  }

  return (
    <div className="app-container">
      {facts.map((fact, index) => (
        <FactCard key={fact._id || index} fact={fact} />
      ))}
    </div>
  );
}

export default App;
