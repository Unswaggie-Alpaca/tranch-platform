import { render, screen } from '@testing-library/react';
import Navbar from './Navbar';

describe('Navbar', () => {
  test('renders brand text', () => {
    render(<Navbar />);
    expect(screen.getByRole('navigation')).toHaveTextContent('Tranch');
  });
});
