/**
 * NotFound Page
 * 404 error page
 */

import React from 'react';
import { Link } from 'react-router-dom';
import { ROUTES } from '../utils/constants';
import { Button } from '../components/ui';

export function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="text-center">
        <h1 className="text-9xl font-bold text-gray-300">404</h1>
        <h2 className="mt-4 text-3xl font-semibold text-gray-900">
          Page not found
        </h2>
        <p className="mt-2 text-gray-600">
          Sorry, we couldn't find the page you're looking for.
        </p>
        <div className="mt-6">
          <Link to={ROUTES.HOME}>
            <Button>Go back home</Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
