/**
 * PatientSearchBar Component
 * Search interface with manual search button
 */

import React, { useState } from 'react';
import { Input, Button } from '../../ui';
import type { PatientSearchParams } from '../../../types';

export interface PatientSearchBarProps {
  onSearch: (params: PatientSearchParams) => void;
  isLoading?: boolean;
}

export function PatientSearchBar({ onSearch, isLoading = false }: PatientSearchBarProps) {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [birthdate, setBirthdate] = useState('');
  const [email, setEmail] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);

  const handleSearch = () => {
    const hasSearchCriteria =
      firstName || lastName || birthdate || email || phoneNumber;

    if (hasSearchCriteria) {
      const params: PatientSearchParams = {};
      if (firstName) params.firstName = firstName;
      if (lastName) params.lastName = lastName;
      if (birthdate) params.birthdate = birthdate;
      if (email) params.email = email;
      if (phoneNumber) params.phoneNumber = phoneNumber;

      onSearch(params);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !isLoading && hasValues) {
      handleSearch();
    }
  };

  const handleClear = () => {
    setFirstName('');
    setLastName('');
    setBirthdate('');
    setEmail('');
    setPhoneNumber('');
  };

  const hasValues =
    firstName || lastName || birthdate || email || phoneNumber;

  return (
    <div className="space-y-4">
      {/* Primary Search */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Input
          label="First Name"
          placeholder="Search by first name..."
          value={firstName}
          onChange={(e) => setFirstName(e.target.value)}
          onKeyPress={handleKeyPress}
          disabled={isLoading}
        />
        <Input
          label="Last Name"
          placeholder="Search by last name..."
          value={lastName}
          onChange={(e) => setLastName(e.target.value)}
          onKeyPress={handleKeyPress}
          disabled={isLoading}
        />
        <Input
          type="date"
          label="Date of Birth"
          value={birthdate}
          onChange={(e) => setBirthdate(e.target.value)}
          onKeyPress={handleKeyPress}
          disabled={isLoading}
        />
      </div>

      {/* Search Actions */}
      <div className="flex items-center gap-2">
        <Button
          variant="primary"
          onClick={handleSearch}
          disabled={isLoading || !hasValues}
        >
          Search
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowAdvanced(!showAdvanced)}
          disabled={isLoading}
        >
          {showAdvanced ? 'Hide' : 'Show'} Advanced Search
        </Button>
        {hasValues && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleClear}
            disabled={isLoading}
          >
            Clear All
          </Button>
        )}
      </div>

      {/* Advanced Search */}
      {showAdvanced && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-gray-200">
          <Input
            type="email"
            label="Email"
            placeholder="Search by email..."
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyPress={handleKeyPress}
            disabled={isLoading}
          />
          <Input
            type="tel"
            label="Phone Number"
            placeholder="Search by phone..."
            value={phoneNumber}
            onChange={(e) => setPhoneNumber(e.target.value)}
            onKeyPress={handleKeyPress}
            disabled={isLoading}
          />
        </div>
      )}

      {/* Search Status */}
      {isLoading && (
        <div className="flex items-center gap-2 text-sm text-gray-600">
          <div className="animate-spin h-4 w-4 border-2 border-blue-600 border-t-transparent rounded-full" />
          Searching...
        </div>
      )}
    </div>
  );
}
