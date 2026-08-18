namespace RajendraGlass.Api.Integration;

// ---------------------------------------------------------------------
// Contract shapes mirror the real NIC e-Invoice (IRP) and e-Way Bill
// portal APIs (accessed in production through a GSP). Field names follow
// the government schema so RealEInvoiceGateway/RealEwayBillGateway are
// genuine implementations of that contract, not placeholders.
// ---------------------------------------------------------------------

public class EInvoiceItemLine
{
    public int SlNo { get; set; }
    public string HsnCd { get; set; } = "";
    public string PrdDesc { get; set; } = "";
    public decimal Qty { get; set; }
    public string Unit { get; set; } = "NOS";
    public decimal UnitPrice { get; set; }
    public decimal TotAmt { get; set; }
    public decimal AssAmt { get; set; }
    public decimal GstRt { get; set; }
    public decimal CgstAmt { get; set; }
    public decimal SgstAmt { get; set; }
    public decimal IgstAmt { get; set; }
    public decimal TotItemVal { get; set; }
}

public class EInvoiceRequest
{
    /// <summary>INV = Regular invoice; matches NIC DocDtls.Typ.</summary>
    public string DocTyp { get; set; } = "INV";
    public string DocNo { get; set; } = "";
    public DateTime DocDt { get; set; }

    public string SellerGstin { get; set; } = "";
    public string SellerLglNm { get; set; } = "";
    public string SellerAddr1 { get; set; } = "";
    public string SellerLoc { get; set; } = "";
    public string SellerPin { get; set; } = "";
    public string SellerStcd { get; set; } = "";

    public string BuyerGstin { get; set; } = "";
    public string BuyerLglNm { get; set; } = "";
    public string BuyerPos { get; set; } = "";   // Place of supply state code
    public string BuyerAddr1 { get; set; } = "";
    public string BuyerLoc { get; set; } = "";
    public string BuyerPin { get; set; } = "";
    public string BuyerStcd { get; set; } = "";

    public List<EInvoiceItemLine> ItemList { get; set; } = new();

    public decimal AssVal { get; set; }
    public decimal CgstVal { get; set; }
    public decimal SgstVal { get; set; }
    public decimal IgstVal { get; set; }
    public decimal TotInvVal { get; set; }
}

public class EInvoiceResult
{
    public bool Success { get; set; }
    public string? Irn { get; set; }
    public string? AckNo { get; set; }
    public DateTime? AckDt { get; set; }
    /// <summary>Raw payload the government QR encodes (SellerGstin|BuyerGstin|DocNo|DocDt|TotInvVal|Irn|IrnDt, per NIC spec).</summary>
    public string? QrPayload { get; set; }
    public string? SignedInvoice { get; set; }
    public string? SignedQrCode { get; set; }
    public string? ErrorCode { get; set; }
    public string? ErrorMessage { get; set; }
}

public class EInvoiceCancelResult
{
    public bool Success { get; set; }
    public string? ErrorCode { get; set; }
    public string? ErrorMessage { get; set; }
}

public class EwayBillItemLine
{
    public string HsnCode { get; set; } = "";
    public string ProductName { get; set; } = "";
    public decimal Quantity { get; set; }
    public decimal TaxableAmount { get; set; }
    public decimal CgstRate { get; set; }
    public decimal SgstRate { get; set; }
    public decimal IgstRate { get; set; }
}

public class EwayBillRequest
{
    public string SupplyType { get; set; } = "O";   // O = Outward
    public string SubSupplyType { get; set; } = "1"; // 1 = Supply
    public string DocType { get; set; } = "INV";
    public string DocNo { get; set; } = "";
    public DateTime DocDate { get; set; }

    public string FromGstin { get; set; } = "";
    public string FromTrdName { get; set; } = "";
    public string FromAddr { get; set; } = "";
    public string FromPlace { get; set; } = "";
    public string FromStateCode { get; set; } = "";

    public string? ToGstin { get; set; }
    public string ToTrdName { get; set; } = "";
    public string ToAddr { get; set; } = "";
    public string ToPlace { get; set; } = "";
    public string ToStateCode { get; set; } = "";

    public decimal TotalValue { get; set; }
    public decimal TaxableAmount { get; set; }
    public decimal CgstValue { get; set; }
    public decimal SgstValue { get; set; }
    public decimal IgstValue { get; set; }

    public string TransMode { get; set; } = "1"; // 1 = Road
    public decimal TransDistanceKm { get; set; }
    public string? TransporterName { get; set; }
    public string? VehicleNo { get; set; }

    public List<EwayBillItemLine> ItemList { get; set; } = new();
}

public class EwayBillResult
{
    public bool Success { get; set; }
    public string? EwbNo { get; set; }
    public DateTime? EwbDate { get; set; }
    public DateTime? ValidUpto { get; set; }
    public string? QrPayload { get; set; }
    public string? ErrorCode { get; set; }
    public string? ErrorMessage { get; set; }
}

public class EwayBillCancelResult
{
    public bool Success { get; set; }
    public string? ErrorCode { get; set; }
    public string? ErrorMessage { get; set; }
}
