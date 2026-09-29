/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useRef } from 'react';
import { Coffee, RotateCcw, CheckCircle2, AlertCircle, ReceiptText, ChevronDown } from 'lucide-react';
import { isSupabaseConfigured, submitOrderToSupabase } from './lib/supabase';

// ==========================================
// 1. 카페 메뉴 및 옵션 데이터 정의 (한국어 주석)
// ==========================================

// 음료 메뉴 목록 (이름 및 기본 가격)
interface DrinkMenuItem {
  id: string;
  name: string;
  price: number;
}

const DRINK_MENU: DrinkMenuItem[] = [
  { id: 'americano', name: '아메리카노', price: 3500 },
  { id: 'caffe_latte', name: '카페라떼', price: 4000 },
  { id: 'caffe_mocha', name: '카페모카', price: 4500 },
  { id: 'vanilla_latte', name: '바닐라라떼', price: 4500 },
  { id: 'green_tea_latte', name: '녹차라떼', price: 4500 },
];

// 음료 사이즈 목록 (라디오 버튼용, 기본값 M)
interface SizeOption {
  id: string;
  label: string;
  extraPrice: number;
}

const SIZE_OPTIONS: SizeOption[] = [
  { id: 'S', label: 'S', extraPrice: 0 },
  { id: 'M', label: 'M', extraPrice: 500 },
  { id: 'L', label: 'L', extraPrice: 1000 },
];

// 추가 옵션 목록 (체크박스용)
interface ExtraOption {
  id: string;
  label: string;
  extraPrice: number;
}

const EXTRA_OPTIONS: ExtraOption[] = [
  { id: 'shot', label: '샷 추가', extraPrice: 500 },
  { id: 'cream', label: '크림 추가', extraPrice: 500 },
  { id: 'syrup', label: '시럽 추가', extraPrice: 300 },
  { id: 'decaf', label: '디카페인', extraPrice: 0 },
];

// 주문 내역 타입 정의 (카페 게시판 목록 저장용)
interface OrderRecord {
  id: string;
  customerName: string;
  phoneNumber: string;
  drinkName: string;
  size: string;
  options: string[];
  quantity: number;
  requests: string;
  totalPrice: number;
  createdAt: string;
}

// ==========================================
// 3. 메인 컴포넌트 (App)
// ==========================================

export default function App() {
  // --- [폼 입력 상태 관리] ---
  const [customerName, setCustomerName] = useState<string>(''); // 이름
  const [phoneNumber, setPhoneNumber] = useState<string>(''); // 전화번호
  const [selectedDrinkId, setSelectedDrinkId] = useState<string>(''); // 음료 ID
  const [selectedSize, setSelectedSize] = useState<string>('M'); // 사이즈 (기본값 'M')
  const [selectedOptions, setSelectedOptions] = useState<string[]>([]); // 선택된 추가 옵션 ID 목록
  const [quantity, setQuantity] = useState<number>(1); // 수량 (기본값 1)
  const [requests, setRequests] = useState<string>(''); // 요청사항

  // --- [알림 및 완료 상태 관리] ---
  const [errorMessage, setErrorMessage] = useState<string | null>(null); // 유효성 검사 에러 메시지
  const [successMessage, setSuccessMessage] = useState<string | null>(null); // 주문 성공 메시지
  const [recentOrders, setRecentOrders] = useState<OrderRecord[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 입력칸 자동 포커스를 위한 Ref
  const nameInputRef = useRef<HTMLInputElement>(null);
  const drinkSelectRef = useRef<HTMLSelectElement>(null);
  const successCardRef = useRef<HTMLDivElement>(null);

  // --- [선택된 음료 객체 조회] ---
  const currentDrink = useMemo(() => {
    return DRINK_MENU.find((item) => item.id === selectedDrinkId) || null;
  }, [selectedDrinkId]);

  // --- [실시간 예상 금액 계산 로직] ---
  // 계산식: (음료 기본가 + 사이즈 추가금 + 체크된 추가옵션 합계) * 수량
  const calculatedTotalPrice = useMemo(() => {
    if (!currentDrink) {
      return 0; // 음료가 선택되지 않았으면 0원
    }

    // 1. 음료 기본 가격
    const baseDrinkPrice = currentDrink.price;

    // 2. 사이즈 추가금
    const sizeConfig = SIZE_OPTIONS.find((s) => s.id === selectedSize);
    const sizeExtra = sizeConfig ? sizeConfig.extraPrice : 0;

    // 3. 추가 옵션 추가금 합산
    const optionsExtra = selectedOptions.reduce((acc, optId) => {
      const opt = EXTRA_OPTIONS.find((o) => o.id === optId);
      return acc + (opt ? opt.extraPrice : 0);
    }, 0);

    // 4. 수량 곱하기
    const singleCupPrice = baseDrinkPrice + sizeExtra + optionsExtra;
    return singleCupPrice * quantity;
  }, [currentDrink, selectedSize, selectedOptions, quantity]);

  // --- [체크박스 옵션 토글 핸들러] ---
  const handleOptionToggle = (optionId: string) => {
    setSelectedOptions((prev) =>
      prev.includes(optionId) ? prev.filter((id) => id !== optionId) : [...prev, optionId]
    );
  };

  // --- [다시 작성 (초기화) 버튼 핸들러] ---
  const handleReset = () => {
    setCustomerName('');
    setPhoneNumber('');
    setSelectedDrinkId('');
    setSelectedSize('M'); // 기본값 M
    setSelectedOptions([]);
    setQuantity(1); // 기본값 1
    setRequests('');
    setErrorMessage(null);
    setSuccessMessage(null);
    if (nameInputRef.current) {
      nameInputRef.current.focus();
    }
  };

  // --- [주문하기 버튼 클릭 핸들러] ---
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // 1. 이름 필수 입력 검사
    if (!customerName.trim()) {
      setErrorMessage('이름을 입력해주세요');
      setSuccessMessage(null);
      nameInputRef.current?.focus();
      return;
    }

    // 2. 음료 필수 선택 검사
    if (!selectedDrinkId || !currentDrink) {
      setErrorMessage('음료를 선택해주세요');
      setSuccessMessage(null);
      drinkSelectRef.current?.focus();
      return;
    }

    // 에러 해제
    setErrorMessage(null);

    if (!isSupabaseConfigured) {
      setErrorMessage('Supabase 설정이 필요합니다. .env.local에 프로젝트 URL과 공개 키를 입력해주세요.');
      return;
    }

    // 3. 옵션 텍스트 정리 (예: "(샷 추가, 크림 추가)")
    const selectedOptionLabels = selectedOptions
      .map((id) => EXTRA_OPTIONS.find((o) => o.id === id)?.label)
      .filter(Boolean) as string[];

    const optionsText =
      selectedOptionLabels.length > 0 ? ` (${selectedOptionLabels.join(', ')})` : '';

    // 4. 주문 확인 메시지 생성
    // "홍길동님, 카페라떼 M사이즈 (샷 추가) 1잔, 총 5,000원 주문이 접수되었습니다!"
    const formattedPrice = calculatedTotalPrice.toLocaleString('ko-KR');
    const confirmationText = `${customerName.trim()}님, ${currentDrink.name} ${selectedSize}사이즈${optionsText} ${quantity}잔, 총 ${formattedPrice}원 주문이 접수되었습니다!`;

    const newOrder: OrderRecord = {
      id: 'order-' + Date.now(),
      customerName: customerName.trim(),
      phoneNumber: phoneNumber.trim() || '미입력',
      drinkName: currentDrink.name,
      size: selectedSize,
      options: selectedOptionLabels,
      quantity,
      requests: requests.trim(),
      totalPrice: calculatedTotalPrice,
      createdAt: '방금 전',
    };

    setIsSubmitting(true);
    try {
      await submitOrderToSupabase({
        customer_name: newOrder.customerName,
        phone_number: phoneNumber.trim() || null,
        drink_name: newOrder.drinkName,
        size: newOrder.size,
        options: newOrder.options,
        quantity: newOrder.quantity,
        requests: newOrder.requests || null,
        total_price: newOrder.totalPrice,
      });
    } catch {
      setErrorMessage('주문 저장에 실패했습니다. Supabase 연결, cafe_menu 테이블과 RLS 정책을 확인해주세요.');
      setSuccessMessage(null);
      setIsSubmitting(false);
      return;
    }

    setSuccessMessage(confirmationText);
    setRecentOrders((prev) => [newOrder, ...prev]);
    setIsSubmitting(false);

    // 주문 확인 영역으로 부드러운 스크롤
    setTimeout(() => {
      successCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 100);
  };

  return (
    <div className="min-h-screen bg-[#faf6f0] text-[#3e2723] py-8 px-4 flex flex-col items-center justify-start">
      {/* ==========================================
          전체 컨테이너: 최대 너비 520px, 가운데 정렬
          ========================================== */}
      <main className="w-full max-w-[520px] mx-auto bg-white rounded-2xl shadow-md border border-[#e8ded5] overflow-hidden transition-all">

        {/* ==========================================
            [페이지 상단]
            - 카페 로고: ☕ 이모지 크게
            - 카페 이름: "바이브 카페"
            - 부제: "당신의 하루에 바이브를 더하다"
            ========================================== */}
        <header className="pt-8 pb-6 px-6 text-center border-b border-[#f3ece4]">
          <div className="inline-block text-5xl mb-2 drop-shadow-xs select-none">
            ☕
          </div>
          <h1 className="text-3xl font-extrabold text-[#6b4226] tracking-tight mb-1">
            바이브 카페
          </h1>
          <p className="text-sm font-medium text-[#8d6e63]">
            당신의 하루에 바이브를 더하다
          </p>
        </header>

        {!isSupabaseConfigured && (
          <div role="status" className="mx-6 mt-5 p-3 rounded-[8px] border border-amber-200 bg-amber-50 text-amber-900 text-sm">
            주문 접수를 사용하려면 .env.local에 Supabase 프로젝트 URL과 공개 키를 설정해주세요.
          </div>
        )}

        {/* ==========================================
            [주문서 폼 영역]
            ========================================== */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5" noValidate>
          
          {/* 오류 알림 메시지 (이름 또는 음료 미입력 시) */}
          {errorMessage && (
            <div
              role="alert"
              className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-[8px] animate-fadeIn"
            >
              <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* 1. 이름 (필수, text) */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label htmlFor="customerName" className="text-sm font-bold text-[#4a2e1b]">
                이름 <span className="text-red-500 font-semibold">*</span>
              </label>
              <span className="text-xs text-[#8d6e63]">필수 입력</span>
            </div>
            <input
              ref={nameInputRef}
              id="customerName"
              type="text"
              value={customerName}
              onChange={(e) => {
                setCustomerName(e.target.value);
                if (errorMessage && e.target.value.trim()) setErrorMessage(null);
              }}
              placeholder="예: 홍길동"
              className="cafe-input"
              required
            />
          </div>

          {/* 2. 전화번호 (tel) */}
          <div className="space-y-1.5">
            <label htmlFor="phoneNumber" className="text-sm font-bold text-[#4a2e1b]">
              전화번호
            </label>
            <input
              id="phoneNumber"
              type="tel"
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              placeholder="예: 010-1234-5678"
              className="cafe-input"
            />
          </div>

          {/* 3. 음료 선택 (드롭다운) */}
          <div className="space-y-1.5">
            <label htmlFor="drinkSelect" className="text-sm font-bold text-[#4a2e1b]">
              음료 선택 <span className="text-red-500 font-semibold">*</span>
            </label>
            <div className="relative">
              <select
                ref={drinkSelectRef}
                id="drinkSelect"
                value={selectedDrinkId}
                onChange={(e) => {
                  setSelectedDrinkId(e.target.value);
                  if (errorMessage) setErrorMessage(null);
                }}
                className="cafe-input appearance-none pr-10 cursor-pointer"
                required
              >
                <option value="">-- 음료를 선택해주세요 --</option>
                {DRINK_MENU.map((drink) => (
                  <option key={drink.id} value={drink.id}>
                    {drink.name} ({drink.price.toLocaleString('ko-KR')}원)
                  </option>
                ))}
              </select>
              <ChevronDown className="w-4 h-4 text-[#8d6e63] absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
          </div>

          {/* 4. 사이즈 (라디오 버튼, 가로 배치) */}
          <div className="space-y-1.5">
            <span className="block text-sm font-bold text-[#4a2e1b]">
              사이즈 선택
            </span>
            <div className="flex flex-wrap items-center gap-4 pt-1">
              {SIZE_OPTIONS.map((size) => {
                const radioId = `size-${size.id.toLowerCase()}`;
                const isChecked = selectedSize === size.id;
                return (
                  <label
                    key={size.id}
                    htmlFor={radioId}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm cursor-pointer select-none transition-all ${
                      isChecked
                        ? 'border-[#6b4226] bg-[#6b4226]/5 text-[#6b4226] font-bold shadow-xs'
                        : 'border-[#d7ccc8] bg-white text-[#5d4037] hover:bg-[#faf6f0]'
                    }`}
                  >
                    <input
                      id={radioId}
                      type="radio"
                      name="drinkSize"
                      value={size.id}
                      checked={isChecked}
                      onChange={() => setSelectedSize(size.id)}
                      className="w-4 h-4"
                    />
                    <span>
                      {size.label}{' '}
                      <span className="text-xs font-normal text-[#8d6e63]">
                        (+{size.extraPrice.toLocaleString('ko-KR')}원)
                      </span>
                    </span>
                  </label>
                );
              })}
            </div>
          </div>

          {/* 5. 추가 옵션 (체크박스, 가로 배치) */}
          <div className="space-y-1.5">
            <span className="block text-sm font-bold text-[#4a2e1b]">
              추가 옵션
            </span>
            <div className="flex flex-wrap items-center gap-3 pt-1">
              {EXTRA_OPTIONS.map((option) => {
                const checkboxId = `opt-${option.id}`;
                const isChecked = selectedOptions.includes(option.id);
                return (
                  <label
                    key={option.id}
                    htmlFor={checkboxId}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm cursor-pointer select-none transition-all ${
                      isChecked
                        ? 'border-[#6b4226] bg-[#6b4226]/5 text-[#6b4226] font-bold shadow-xs'
                        : 'border-[#d7ccc8] bg-white text-[#5d4037] hover:bg-[#faf6f0]'
                    }`}
                  >
                    <input
                      id={checkboxId}
                      type="checkbox"
                      value={option.id}
                      checked={isChecked}
                      onChange={() => handleOptionToggle(option.id)}
                      className="w-4 h-4"
                    />
                    <span>
                      {option.label}{' '}
                      <span className="text-xs font-normal text-[#8d6e63]">
                        (+{option.extraPrice.toLocaleString('ko-KR')}원)
                      </span>
                    </span>
                  </label>
                );
              })}
            </div>
          </div>

          {/* 6. 수량 (number 타입, 최소 1, 최대 10, 기본값 1) */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label htmlFor="drinkQuantity" className="text-sm font-bold text-[#4a2e1b]">
                수량
              </label>
              <span className="text-xs text-[#8d6e63]">최소 1잔 ~ 최대 10잔</span>
            </div>
            <div className="flex items-center gap-3">
              <input
                id="drinkQuantity"
                type="number"
                min={1}
                max={10}
                value={quantity}
                onChange={(e) => {
                  const val = parseInt(e.target.value, 10);
                  if (isNaN(val)) setQuantity(1);
                  else if (val < 1) setQuantity(1);
                  else if (val > 10) setQuantity(10);
                  else setQuantity(val);
                }}
                className="cafe-input w-32 text-center font-bold text-base"
              />
              <span className="text-sm text-[#5d4037] font-medium">잔</span>
            </div>
          </div>

          {/* 7. 요청사항 (textarea) */}
          <div className="space-y-1.5">
            <label htmlFor="orderRequests" className="text-sm font-bold text-[#4a2e1b]">
              요청사항
            </label>
            <textarea
              id="orderRequests"
              rows={3}
              value={requests}
              onChange={(e) => setRequests(e.target.value)}
              placeholder="예: 얼음 적게 넣어주세요, 픽업 시 캐리어 부탁드립니다."
              className="cafe-input resize-none"
            />
          </div>

          {/* ==========================================
              [예상 금액 표시 영역]
              - 주문하기 버튼 바로 위에 큰 글씨로 표시
              - 큰 글씨(24px), 갈색, 굵게, 가운데 정렬
              - 예) "예상 금액: 5,000원"
              ========================================== */}
          <div className="pt-2 pb-1 bg-[#faf6f0] rounded-xl p-4 border border-[#eee4d9] text-center">
            <span className="text-xs uppercase tracking-wider text-[#8d6e63] font-semibold block mb-0.5">
              실시간 계산 금액
            </span>
            <div className="text-[24px] font-bold text-[#6b4226] text-center">
              예상 금액: {calculatedTotalPrice.toLocaleString('ko-KR')}원
            </div>
            {selectedDrinkId ? (
              <p className="text-xs text-[#8d6e63] mt-1">
                {currentDrink?.name} ({selectedSize})
                {selectedOptions.length > 0 && ` + 옵션 ${selectedOptions.length}개`} × {quantity}잔
              </p>
            ) : (
              <p className="text-xs text-[#a1887f] mt-1">
                음료를 선택하시면 상세 금액이 계산됩니다.
              </p>
            )}
          </div>

          {/* ==========================================
              [버튼 영역]
              8. 주문하기 버튼 (갈색 배경 #6b4226, 흰색 글씨, hover시 약간 밝게)
              9. 다시 작성 버튼 (초기화)
              ========================================== */}
          <div className="flex items-center gap-3 pt-2">
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 py-3 px-5 rounded-[8px] bg-[#6b4226] hover:bg-[#7d4f30] active:scale-[0.99] text-white font-bold text-base shadow-sm transition-all cursor-pointer flex items-center justify-center gap-2"
            >
              <CheckCircle2 className="w-5 h-5 text-white/90" />
              {isSubmitting ? '접수 중...' : '주문하기'}
            </button>

            <button
              type="button"
              onClick={handleReset}
              className="py-3 px-4 rounded-[8px] border border-[#d7ccc8] bg-white hover:bg-[#f5ede4] text-[#6b4226] font-semibold text-sm transition-all cursor-pointer flex items-center gap-1.5 shrink-0"
              title="모든 입력 필드 초기화"
            >
              <RotateCcw className="w-4 h-4 text-[#6b4226]" />
              다시 작성
            </button>
          </div>
        </form>

        {/* ==========================================
            [주문 확인 메시지]
            - 연두색 배경, 초록 글씨, 둥근 모서리
            - 예: "홍길동님, 카페라떼 M사이즈 (샷 추가) 1잔, 총 5,000원 주문이 접수되었습니다!"
            ========================================== */}
        {successMessage && (
          <section
            ref={successCardRef}
            className="mx-6 mb-6 p-4 bg-[#e8f5e9] border border-[#c8e6c9] rounded-[8px] text-[#2e7d32] shadow-xs animate-fadeIn"
          >
            <div className="flex items-start gap-2.5">
              <CheckCircle2 className="w-5 h-5 text-[#2e7d32] shrink-0 mt-0.5" />
              <div className="space-y-1">
                <h2 className="text-sm font-bold text-[#1b5e20]">주문이 성공적으로 접수되었습니다</h2>
                <p className="text-sm leading-relaxed font-semibold">
                  {successMessage}
                </p>
                <p className="text-xs text-[#388e3c] pt-1">
                  매장에서 정성껏 준비하겠습니다. 잠시만 기다려주세요!
                </p>
              </div>
            </div>
          </section>
        )}

        {/* ==========================================
            [최근 주문 현황 게시판 (Recent Orders)]
            - 실제 카페 주문 게시판처럼 접수된 내역 표시
            ========================================== */}
        {recentOrders.length > 0 && (
          <section className="border-t border-[#f0e7df] bg-[#faf7f3] p-6">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-bold text-[#4a2e1b] flex items-center gap-1.5">
                <ReceiptText className="w-4 h-4 text-[#6b4226]" />
                접수된 주문 현황 ({recentOrders.length}건)
              </h2>
              <span className="text-xs text-[#8d6e63]">실시간 접수 목록</span>
            </div>

            <div className="space-y-2.5 max-h-56 overflow-y-auto pr-1">
              {recentOrders.map((order) => (
                <div
                  key={order.id}
                  className="bg-white p-3 rounded-lg border border-[#e8ded5] shadow-2xs flex flex-col gap-1 text-xs"
                >
                  <div className="flex items-center justify-between font-semibold text-[#3e2723]">
                    <span className="text-[#6b4226]">
                      {order.customerName}님 <span className="font-normal text-[#8d6e63]">({order.phoneNumber})</span>
                    </span>
                    <span className="font-bold text-[#6b4226]">
                      {order.totalPrice.toLocaleString('ko-KR')}원
                    </span>
                  </div>

                  <div className="text-[#5d4037]">
                    {order.drinkName} · {order.size}사이즈 · {order.quantity}잔
                    {order.options.length > 0 && (
                      <span className="text-[#8d6e63]"> ({order.options.join(', ')})</span>
                    )}
                  </div>

                  {order.requests && (
                    <div className="text-[#8d6e63] bg-[#faf6f0] px-2 py-1 rounded text-[11px] mt-0.5">
                      요청: {order.requests}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* 푸터 영역 */}
        <footer className="py-4 px-6 text-center text-xs text-[#a1887f] border-t border-[#f3ece4] bg-white">
          <p>© 2026 바이브 카페 (Vibe Cafe). 따뜻하고 행복한 하루 되세요.</p>
        </footer>
      </main>
    </div>
  );
}
