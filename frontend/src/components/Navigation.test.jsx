import { render, screen } from '@testing-library/react';
import Navigation from './Navigation';

describe('Navigation', () => {
  test('renders brand text', () => {
    render(<Navigation />);
    expect(screen.getByRole('navigation')).toHaveTextContent('Tranch');
  });
});
