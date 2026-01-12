/**
 * Slot Selection Step
 * Step 2 of the appointment wizard - Select an available time slot
 */

import { useEffect, useState } from 'react';
import FullCalendar from '@fullcalendar/react';
import timeGridPlugin from '@fullcalendar/timegrid';
import dayGridPlugin from '@fullcalendar/daygrid';
import interactionPlugin from '@fullcalendar/interaction';
import { useAppDispatch, useAppSelector } from '../../../../store/hooks';
import {
  fetchAvailableSlots,
  selectAvailableSlots,
  selectSlotsLoading,
  selectSlotsError,
  clearAvailableSlots,
} from '../../../../store/slices/appointmentSlice';
import { useReference } from '../../../../hooks/useReference';
import { Button } from '../../../ui/Button';
import { SearchableSelect } from '../../../ui/SearchableSelect';
import { Spinner } from '../../../ui/Spinner';
import { GuidCopyButton } from '../../../ui/GuidCopyButton';
import { cn } from '../../../../utils/cn';
import type { AppointmentWizardData } from '../../../../types';
import type { AvailableSlot } from '../../../../types';
import { format } from 'date-fns';
import { CopyToPostmanButton } from '../../postman/CopyToPostmanButton';

export interface SlotSelectionStepProps {
  wizardData: AppointmentWizardData;
  onSlotSelect: (slot: AvailableSlot) => void;
  onFilterChange: (filters: Partial<AppointmentWizardData>) => void;
  onNext: () => void;
  onBack: () => void;
  className?: string;
}

export function SlotSelectionStep({
  wizardData,
  onSlotSelect,
  onFilterChange,
  onNext,
  onBack,
  className,
}: SlotSelectionStepProps) {
  const dispatch = useAppDispatch();
  const availableSlots = useAppSelector(selectAvailableSlots);
  const slotsLoading = useAppSelector(selectSlotsLoading);
  const slotsError = useAppSelector(selectSlotsError);
  const { locations, appointmentTypes, providers, loading: refLoading } = useReference();

  const [selectedSlot, setSelectedSlot] = useState<AvailableSlot | null>(null);
  const [localFilters, setLocalFilters] = useState({
    locationGuid: wizardData.locationGuid || '',
    providerGuid: wizardData.providerGuid || '',
    appointmentTypeGuid: wizardData.appointmentTypeGuid || '',
  });

  // Date range selection state
  const [startDate, setStartDate] = useState<string | null>(null);
  const [endDate, setEndDate] = useState<string | null>(null);
  const [showingSlots, setShowingSlots] = useState(false);
  const [selectingEndDate, setSelectingEndDate] = useState(false);

  // Fetch available slots when filters and date range are complete
  useEffect(() => {
    console.log('SlotSelectionStep useEffect triggered', {
      locationGuid: localFilters.locationGuid,
      appointmentTypeGuid: localFilters.appointmentTypeGuid,
      startDate,
      endDate,
      showingSlots,
    });

    if (localFilters.locationGuid && localFilters.appointmentTypeGuid && startDate && endDate) {
      console.log('Fetching available slots with dates:', { startDate, endDate });

      // Convert yyyy-MM-dd to MM/dd/yyyy without timezone issues
      const formatDateString = (dateStr: string) => {
        const [year, month, day] = dateStr.split('-');
        return `${month}/${day}/${year}`;
      };

      dispatch(
        fetchAvailableSlots({
          locationGuid: localFilters.locationGuid,
          appointmentTypeGuid: localFilters.appointmentTypeGuid,
          startDate: formatDateString(startDate),
          endDate: formatDateString(endDate),
          ...(localFilters.providerGuid && { providerGuid: localFilters.providerGuid }),
        })
      );
      setShowingSlots(true);
    }

    return () => {
      dispatch(clearAvailableSlots());
    };
  }, [
    dispatch,
    localFilters.locationGuid,
    localFilters.providerGuid,
    localFilters.appointmentTypeGuid,
    startDate,
    endDate,
  ]);

  const handleFilterChange = (field: string, value: string | number) => {
    const newFilters = { ...localFilters, [field]: value };
    setLocalFilters(newFilters);
    onFilterChange(newFilters);

    // Clear selections when filters change
    setSelectedSlot(null);
    setStartDate(null);
    setEndDate(null);
    setShowingSlots(false);
    setSelectingEndDate(false);
  };

  const handleDateClick = (dateClickInfo: any) => {
    console.log('handleDateClick called', { dateClickInfo, startDate, endDate, selectingEndDate });

    // Only allow date selection if filters are set and we're not already showing slots
    if (!localFilters.locationGuid || !localFilters.appointmentTypeGuid) {
      console.log('Filters not set, ignoring date click');
      return;
    }

    const clickedDate = format(dateClickInfo.date, 'yyyy-MM-dd');
    console.log('Clicked date:', clickedDate);

    if (!startDate || selectingEndDate) {
      // First click or clicking end date
      if (!startDate) {
        // First click - set start date
        console.log('Setting start date:', clickedDate);
        setStartDate(clickedDate);
        setEndDate(null);
        setSelectingEndDate(true);
      } else {
        // Second click - set end date
        const start = new Date(startDate);
        const end = new Date(clickedDate);

        if (end < start) {
          // If end is before start, swap them
          console.log('Swapping dates - end before start');
          setStartDate(clickedDate);
          setEndDate(startDate);
        } else {
          console.log('Setting end date:', clickedDate);
          setEndDate(clickedDate);
        }
        setSelectingEndDate(false);
      }
    }
    setSelectedSlot(null);
  };

  const handleBackToDateSelection = () => {
    setStartDate(null);
    setEndDate(null);
    setShowingSlots(false);
    setSelectedSlot(null);
    setSelectingEndDate(false);
    dispatch(clearAvailableSlots());
  };

  const handleEventClick = (info: any) => {
    const slot = info.event.extendedProps.slot as AvailableSlot;
    setSelectedSlot(slot);
    onSlotSelect(slot);
  };

  const handleRefresh = () => {
    if (localFilters.locationGuid && localFilters.appointmentTypeGuid && startDate && endDate) {
      setSelectedSlot(null);

      // Convert yyyy-MM-dd to MM/dd/yyyy without timezone issues
      const formatDateString = (dateStr: string) => {
        const [year, month, day] = dateStr.split('-');
        return `${month}/${day}/${year}`;
      };

      dispatch(
        fetchAvailableSlots({
          locationGuid: localFilters.locationGuid,
          appointmentTypeGuid: localFilters.appointmentTypeGuid,
          startDate: formatDateString(startDate),
          endDate: formatDateString(endDate),
          ...(localFilters.providerGuid && { providerGuid: localFilters.providerGuid }),
        })
      );
    }
  };

  // Transform slots to FullCalendar events
  const calendarEvents = availableSlots.map((slot) => {
    const start = new Date(slot.dateTime);
    const end = new Date(start.getTime() + slot.durationMinutes * 60000);
    const isSelected = selectedSlot?.dateTime === slot.dateTime;

    return {
      id: `${slot.dateTime}-${slot.providerGuid || 'any'}`,
      title: 'Available',
      start: start.toISOString(),
      end: end.toISOString(),
      backgroundColor: isSelected ? '#3b82f6' : '#10b981',
      borderColor: isSelected ? '#2563eb' : '#059669',
      extendedProps: { slot },
    };
  });

  const canProceed = selectedSlot !== null;
  const canSearch = localFilters.locationGuid && localFilters.appointmentTypeGuid;
  const canSelectDates = canSearch && !showingSlots;

  // Filter providers by selected location
  const filteredProviders = localFilters.locationGuid
    ? providers.filter((p) => p.locationGuid === localFilters.locationGuid)
    : providers;

  // Create visual events for selected date range on monthly calendar
  const dateRangeEvents =
    startDate && !showingSlots
      ? [
          {
            start: startDate,
            end: endDate || startDate,
            display: 'background',
            backgroundColor: '#dbeafe',
            borderColor: '#3b82f6',
          },
        ]
      : [];

  return (
    <div className={cn('space-y-6', className)}>
      {/* Header */}
      <div>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
          {showingSlots ? 'Choose Available Time Slot' : 'Select Date Range'}
        </h3>
        <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">
          {showingSlots
            ? 'Click on a time slot to select it for your appointment'
            : selectingEndDate
            ? 'Click on the end date for your appointment range'
            : 'Select location and appointment type, then click on the calendar to choose start and end dates'}
        </p>
      </div>

      {/* API Call Display - Copy cURL */}
      {showingSlots && startDate && endDate && (
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-blue-900 dark:text-blue-100">
                API Search Query
              </p>
              <p className="text-xs text-blue-700 dark:text-blue-300 mt-1">
                GetOnlineReservations with {availableSlots.length} result{availableSlots.length !== 1 ? 's' : ''}
              </p>
            </div>
            <div className="flex-shrink-0">
              <CopyToPostmanButton
                procedure="GetOnlineReservations"
                parameters={{
                  startDate: `${(() => {
                    const [year, month, day] = startDate.split('-');
                    return `${month}/${day}/${year}`;
                  })()} 7:00:00 AM`,
                  endDate: `${(() => {
                    const [year, month, day] = endDate.split('-');
                    return `${month}/${day}/${year}`;
                  })()} 5:00:00 PM`,
                  morning: 'True',
                  afternoon: 'True',
                  ...(localFilters.providerGuid && { schdvwGUIDs: localFilters.providerGuid }),
                  ...(localFilters.appointmentTypeGuid && { appttypGUIDs: localFilters.appointmentTypeGuid }),
                }}
                variant="icon"
                size="md"
              />
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg p-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Location */}
          <div className="flex items-end gap-1">
            <div className="flex-1">
              <SearchableSelect
                label="Location *"
                value={localFilters.locationGuid}
                onChange={(value) => handleFilterChange('locationGuid', value)}
                disabled={refLoading}
                required
                placeholder={refLoading ? 'Loading...' : 'Type to search or select...'}
                options={locations.map((loc) => ({
                  value: loc.guid,
                  label: loc.address?.city && loc.address?.state
                    ? `${loc.name} (${loc.address.city}, ${loc.address.state})`
                    : loc.address?.city
                    ? `${loc.name} (${loc.address.city})`
                    : loc.name,
                }))}
              />
            </div>
            {refLoading ? (
              <div className="p-2">
                <Spinner size="sm" />
              </div>
            ) : (
              <GuidCopyButton
                label="Location GUID"
                guid={localFilters.locationGuid}
                disabled={!localFilters.locationGuid}
              />
            )}
          </div>

          {/* Appointment Type */}
          <div className="flex items-end gap-1">
            <div className="flex-1">
              <SearchableSelect
                label="Appointment Type *"
                value={localFilters.appointmentTypeGuid}
                onChange={(value) => handleFilterChange('appointmentTypeGuid', value)}
                disabled={refLoading}
                required
                placeholder={refLoading ? 'Loading...' : 'Type to search or select...'}
                options={appointmentTypes.map((type) => ({
                  value: type.guid,
                  label: `${type.description} (${type.durationMinutes} min)`,
                }))}
              />
            </div>
            {refLoading ? (
              <div className="p-2">
                <Spinner size="sm" />
              </div>
            ) : (
              <GuidCopyButton
                label="Appointment Type GUID"
                guid={localFilters.appointmentTypeGuid}
                disabled={!localFilters.appointmentTypeGuid}
              />
            )}
          </div>

          {/* Provider */}
          <div className="flex items-end gap-1">
            <div className="flex-1">
              <SearchableSelect
                label="Provider (Optional)"
                value={localFilters.providerGuid}
                onChange={(value) => handleFilterChange('providerGuid', value)}
                disabled={refLoading || !localFilters.locationGuid}
                placeholder={refLoading ? 'Loading...' : 'Type to search or select...'}
                options={filteredProviders.map((prov) => ({
                  value: prov.scheduleColumnGuid,
                  label: prov.scheduleColumnDescription,
                }))}
              />
            </div>
            {refLoading ? (
              <div className="p-2">
                <Spinner size="sm" />
              </div>
            ) : (
              <GuidCopyButton
                label="Provider GUID"
                guid={localFilters.providerGuid}
                disabled={!localFilters.providerGuid}
              />
            )}
          </div>
        </div>

        {/* Date Range Inputs */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
          <div>
            <label htmlFor="startDatePicker" className="block text-sm font-semibold text-gray-900 dark:text-white mb-1">
              Start Date *
            </label>
            <input
              id="startDatePicker"
              type="date"
              value={startDate || ''}
              onChange={(e) => {
                console.log('Start date manually changed:', e.target.value);
                setStartDate(e.target.value);
                if (!e.target.value) {
                  setEndDate(null);
                  setSelectingEndDate(false);
                } else {
                  setSelectingEndDate(true);
                }
              }}
              min={format(new Date(), 'yyyy-MM-dd')}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-500 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white [color-scheme:light] dark:[color-scheme:dark] disabled:bg-gray-100 dark:disabled:bg-gray-800 disabled:text-gray-500 dark:disabled:text-gray-400"
              disabled={!canSearch}
            />
          </div>

          <div>
            <label htmlFor="endDatePicker" className="block text-sm font-semibold text-gray-900 dark:text-white mb-1">
              End Date *
            </label>
            <input
              id="endDatePicker"
              type="date"
              value={endDate || ''}
              onChange={(e) => {
                console.log('End date manually changed:', e.target.value);
                const newEndDate = e.target.value;
                if (newEndDate && startDate && new Date(newEndDate) < new Date(startDate)) {
                  // Swap if end is before start
                  setEndDate(startDate);
                  setStartDate(newEndDate);
                } else {
                  setEndDate(newEndDate);
                }
                setSelectingEndDate(false);
              }}
              min={startDate || format(new Date(), 'yyyy-MM-dd')}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-500 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white [color-scheme:light] dark:[color-scheme:dark] disabled:bg-gray-100 dark:disabled:bg-gray-800 disabled:text-gray-500 dark:disabled:text-gray-400"
              disabled={!startDate}
            />
          </div>
        </div>

        {/* Actions */}
        {startDate && (
          <div className="mt-4 flex justify-end gap-2">
            {!showingSlots && (
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  setStartDate(null);
                  setEndDate(null);
                  setSelectingEndDate(false);
                }}
              >
                Clear Dates
              </Button>
            )}
            {showingSlots && (
              <Button size="sm" variant="secondary" onClick={handleBackToDateSelection}>
                Change Dates
              </Button>
            )}
            {showingSlots && (
              <Button size="sm" variant="secondary" onClick={handleRefresh} disabled={slotsLoading}>
                {slotsLoading ? <Spinner size="sm" /> : 'Refresh Slots'}
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Selected Slot Display */}
      {selectedSlot && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <p className="text-sm font-medium text-blue-900">Selected Time Slot</p>
          <p className="text-lg font-semibold text-blue-700 mt-1">
            {new Date(selectedSlot.dateTime).toLocaleString('en-US', {
              weekday: 'long',
              month: 'long',
              day: 'numeric',
              year: 'numeric',
              hour: 'numeric',
              minute: '2-digit',
              hour12: true,
            })}
          </p>
          <p className="text-sm text-blue-600 mt-1">Duration: {selectedSlot.durationMinutes} minutes</p>
        </div>
      )}

      {/* Calendar */}
      <div className="border border-gray-200 rounded-lg overflow-hidden">
        {slotsLoading && (
          <div className="flex items-center justify-center py-12">
            <Spinner size="lg" />
            <span className="ml-3 text-gray-600">Loading available slots...</span>
          </div>
        )}

        {slotsError && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 m-4">
            <p className="text-red-800 font-medium">Error loading slots</p>
            <p className="text-red-600 text-sm mt-1">{slotsError}</p>
          </div>
        )}

        {!slotsLoading && !slotsError && canSearch && showingSlots && (
          <div className="bg-white border border-gray-200 rounded-lg">
            <FullCalendar
              plugins={[timeGridPlugin, dayGridPlugin, interactionPlugin]}
              initialView="timeGridWeek"
              initialDate={startDate || undefined}
              visibleRange={
                startDate && endDate
                  ? {
                      start: startDate,
                      end: endDate,
                    }
                  : undefined
              }
              headerToolbar={{
                left: 'prev,next today',
                center: 'title',
                right: '',
              }}
              events={calendarEvents}
              eventClick={handleEventClick}
              slotMinTime="08:00:00"
              slotMaxTime="18:00:00"
              allDaySlot={false}
              height="600px"
              eventTimeFormat={{
                hour: 'numeric',
                minute: '2-digit',
                meridiem: 'short',
              }}
            />
          </div>
        )}

        {!slotsLoading && canSelectDates && (
          <div className="bg-white border border-gray-200 rounded-lg">
            <FullCalendar
              plugins={[dayGridPlugin, interactionPlugin]}
              initialView="dayGridMonth"
              headerToolbar={{
                left: 'prev,next today',
                center: 'title',
                right: '',
              }}
              dateClick={handleDateClick}
              events={dateRangeEvents}
              height="600px"
              validRange={{
                start: new Date(),
              }}
            />
          </div>
        )}

        {!slotsLoading && !slotsError && showingSlots && availableSlots.length === 0 && (
          <div className="text-center py-12 text-gray-500">
            <p className="font-medium">No available slots found</p>
            <p className="text-sm mt-2">Try adjusting your filters or selecting a different date range</p>
          </div>
        )}

        {!canSearch && !slotsLoading && (
          <div className="text-center py-12 text-gray-500">
            <svg
              className="mx-auto h-12 w-12 text-gray-300"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
              />
            </svg>
            <p className="mt-4 font-medium">Select location and appointment type to begin</p>
          </div>
        )}
      </div>

      {/* Navigation */}
      <div className="flex justify-between pt-4 border-t border-gray-200">
        <Button variant="secondary" onClick={onBack}>
          Back
        </Button>
        <Button onClick={onNext} disabled={!canProceed}>
          Next: Appointment Details
        </Button>
      </div>
    </div>
  );
}
