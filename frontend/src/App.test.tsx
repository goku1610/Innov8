import React from 'react';
import { render, screen } from '@testing-library/react';
import App from './App';

test('renders code execution platform', () => {
  render(<App />);
  const headerElement = screen.getByText(/Code Execution Platform/i);
  expect(headerElement).toBeInTheDocument();
});
